import asyncio
import os
import signal
import sys
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse


MAX_SOURCE_BYTES = 10 * 1024 * 1024
MAX_MARKDOWN_CHARS = 50_000
POCKETBASE_URL = os.environ.get("POCKETBASE_URL", "http://pocketbase:8080").rstrip("/")
ALLOWED_SUFFIXES = {".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".md", ".markdown", ".txt", ".html", ".htm", ".csv"}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class ConversionAdmission:
    """Reject extra uploads before multipart parsing consumes temporary space."""
    def __init__(self, app):
        self.app = app
        self.slot = asyncio.Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path") != "/api/bolsso/rules/convert":
            return await self.app(scope, receive, send)
        if self.slot.locked():
            response = JSONResponse({"detail": "다른 문서를 변환 중입니다. 잠시 후 다시 시도해 주세요."}, status_code=429)
            return await response(scope, receive, send)
        async with self.slot:
            return await self.app(scope, receive, send)


app.add_middleware(ConversionAdmission)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://cream284.github.io", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
CONVERSION_TIMEOUT_SECONDS = 45
conversion_slot = asyncio.Lock()


@app.get("/api/bolsso/rules/converter-health")
async def converter_health() -> dict[str, str]:
    return {"status": "ok"}


async def run_conversion(source_path: str, output_path: str) -> str:
    process = await asyncio.create_subprocess_exec(
        sys.executable, str(Path(__file__).with_name("worker.py")), source_path, output_path,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        await asyncio.wait_for(process.wait(), timeout=CONVERSION_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="문서 변환 시간이 초과되었습니다. 문서를 나누어 다시 시도해 주세요.")
    finally:
        # Terminate descendants too, including any spawned document processors.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        await process.wait()
    if process.returncode != 0:
        raise HTTPException(status_code=422, detail="파일을 Markdown으로 변환하지 못했습니다.")
    output = Path(output_path)
    if output.stat().st_size > MAX_MARKDOWN_CHARS * 4:
        raise HTTPException(status_code=422, detail="변환 결과가 너무 깁니다.")
    return output.read_text(encoding="utf-8").strip()


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
    if conversion_slot.locked():
        raise HTTPException(status_code=429, detail="다른 문서를 변환 중입니다. 잠시 후 다시 시도해 주세요.")
    async with conversion_slot:
        source = await file.read(MAX_SOURCE_BYTES + 1)
        if not source:
            raise HTTPException(status_code=422, detail="빈 파일은 변환할 수 없습니다.")
        if len(source) > MAX_SOURCE_BYTES:
            raise HTTPException(status_code=413, detail="원본 파일은 10MB 이하여야 합니다.")
        try:
            with tempfile.TemporaryDirectory(prefix="rule-", dir="/tmp") as work:
                source_path = Path(work) / ("source" + suffix)
                source_path.write_bytes(source)
                markdown = await run_conversion(str(source_path), str(Path(work) / "output.md"))
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=422, detail="파일을 Markdown으로 변환하지 못했습니다.")

    if not markdown:
        raise HTTPException(status_code=422, detail="추출할 텍스트가 없습니다. 스캔 문서는 내용을 직접 입력해 주세요.")
    if len(markdown) > MAX_MARKDOWN_CHARS:
        raise HTTPException(status_code=422, detail="변환 결과가 너무 깁니다. 50,000자 이하 문서만 지원합니다.")

    return {"markdown": markdown, "sourceName": source_name}
