"""One conversion per disposable process; never print source contents."""
import resource
import sys
from pathlib import Path


def main() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    resource.setrlimit(resource.RLIMIT_FSIZE, (256 * 1024, 256 * 1024))
    from markitdown import MarkItDown

    result = MarkItDown(enable_plugins=False).convert_local(sys.argv[1])
    markdown = str(getattr(result, "text_content", "") or getattr(result, "markdown", "")).strip()
    if not markdown or len(markdown) > 50_000:
        raise ValueError("Invalid conversion output length")
    Path(sys.argv[2]).write_text(markdown, encoding="utf-8")


if __name__ == "__main__":
    main()
