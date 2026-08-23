import os
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from markitdown import MarkItDown


MAX_SOURCE_BYTES = 10 * 1024 * 1024
MAX_MARKDOWN_CHARS = 50_000
POCKETBASE_URL = os.environ.get("POCKETBASE_URL", "http://pocketbase:8080").rstrip("/")
ALLOWED_SUFFIXES = {".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".md", ".markdown", ".txt", ".html", ".htm", ".csv"}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://cream284.github.io", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
converter = MarkItDown(enable_plugins=False)


async def require_rule_manager(authorization: str | None) -> None:
    if not authorization:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    try:
        async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
            response = await client.post(
                f"{POCKETBASE_URL}/api/collections/members/auth-refresh",
                headers={"Authorization": authorization},
            )
        data = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=503, detail="권한을 확인할 수 없습니다.")

    record = data.get("record", {}) if response.is_success else {}
    allowed = record.get("active") is True and record.get("mustChangePassword") is not True and (
        record.get("isAdmin") is True or record.get("role") in {"admin", "chair"}
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="규약 변환 권한이 없습니다.")


@app.post("/api/bolsso/rules/convert")
async def convert_rule_source(
    file: UploadFile = File(...), authorization: str | None = Header(default=None)
) -> dict[str, str]:
    await require_rule_manager(authorization)

    source_name = Path(file.filename or "source").name
    suffix = Path(source_name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="지원하지 않는 파일 형식입니다.")

    source = await file.read(MAX_SOURCE_BYTES + 1)
    if not source:
        raise HTTPException(status_code=422, detail="빈 파일은 변환할 수 없습니다.")
    if len(source) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="원본 파일은 10MB 이하여야 합니다.")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="rule-", suffix=suffix, dir="/tmp", delete=False) as temp:
            temp.write(source)
            temp_path = temp.name
        result = converter.convert_local(temp_path)
        markdown = str(getattr(result, "text_content", "") or getattr(result, "markdown", "")).strip()
    except Exception:
        raise HTTPException(status_code=422, detail="파일을 Markdown으로 변환하지 못했습니다.")
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)

    if not markdown:
        raise HTTPException(status_code=422, detail="추출할 텍스트가 없습니다. 스캔 문서는 내용을 직접 입력해 주세요.")
    if len(markdown) > MAX_MARKDOWN_CHARS:
        raise HTTPException(status_code=422, detail="변환 결과가 너무 깁니다. 50,000자 이하 문서만 지원합니다.")

    return {"markdown": markdown, "sourceName": source_name}
