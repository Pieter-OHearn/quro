"""Extracts text from one PDF in a separate, resource-limited process.

The service starts this module once per document (`python -m app.extract_worker`), writes a
JSON header line and the PDF bytes to its standard input, and reads one JSON object from its
standard output. The process limits its own address space, CPU time and file size before it
reads the document; the renderer and OCR processes it starts inherit those limits. The service
kills the whole process group when the wall-clock bound runs out.

Failures are reported as a short code, never as the parser's own message, which can quote the
document.
"""

from __future__ import annotations

import json
import resource
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from app.limits import ParserLimits

MIN_TEXT_LENGTH = 400
PDF_HEADER = b"%PDF-"
# The PDF header may follow some leading bytes; readers look within the first kilobyte.
PDF_HEADER_WINDOW = 1024
POINTS_PER_INCH = 72
TESSERACT_LANGUAGES = {"en": "eng", "nl": "nld"}


class ExtractionFailure(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def apply_resource_limits(limits: ParserLimits) -> None:
    """Bounds this process and every process it starts. The service runs on Linux, which
    enforces all of these; macOS reserves more address space than any useful bound at start,
    so development there runs without the memory bound."""
    wanted = [
        # The soft limit sends SIGXCPU, the hard limit SIGKILL a moment later.
        (resource.RLIMIT_CPU, limits.cpu_seconds, limits.cpu_seconds + 2),
        # Rendered pages and the copy of the PDF are the only files written.
        (resource.RLIMIT_FSIZE, limits.max_file_bytes + 64 * 1024 * 1024, None),
        (resource.RLIMIT_CORE, 0, 0),
    ]
    if sys.platform.startswith("linux"):
        wanted.append((resource.RLIMIT_AS, limits.memory_bytes, limits.memory_bytes))
    for kind, soft, hard in wanted:
        try:
            resource.setrlimit(kind, (soft, soft if hard is None else hard))
        except (ValueError, OSError):
            # A platform that refuses a bound runs without it; Linux accepts all of them.
            continue


def _read_input(stream: Any) -> tuple[dict[str, Any], bytes]:
    header_line = stream.readline()
    header = json.loads(header_line)
    return header, stream.read()


def _open_reader(data: bytes) -> Any:
    from io import BytesIO

    from pypdf import PasswordType, PdfReader

    if PDF_HEADER not in data[:PDF_HEADER_WINDOW]:
        raise ExtractionFailure("not_pdf")
    try:
        reader = PdfReader(BytesIO(data))
    except MemoryError:
        raise
    except Exception as exc:
        raise ExtractionFailure("malformed") from exc

    if reader.is_encrypted:
        # Statements protected only against editing open with an empty password; anything that
        # needs a real password is refused.
        try:
            opened = reader.decrypt("")
        except Exception as exc:
            raise ExtractionFailure("encrypted") from exc
        if opened == PasswordType.NOT_DECRYPTED:
            raise ExtractionFailure("encrypted")
    return reader


def _page_count(reader: Any, limits: ParserLimits) -> int:
    try:
        count = len(reader.pages)
    except MemoryError:
        raise
    except Exception as exc:
        raise ExtractionFailure("malformed") from exc
    if count <= 0:
        raise ExtractionFailure("malformed")
    if count > limits.max_pages:
        raise ExtractionFailure("too_many_pages")
    return count


def _append_capped(parts: list[str], used: int, index: int, text: str, cap: int) -> int:
    text = text.strip()
    if not text:
        return used
    chunk = f"[Page {index}]\n{text}\n"
    remaining = cap - used
    if remaining <= 0:
        return used
    parts.append(chunk[:remaining])
    return used + min(len(chunk), remaining)


def extract_embedded_text(reader: Any, page_count: int, limits: ParserLimits) -> str:
    """Reads the text layer page by page and stops once the character bound is reached."""
    parts: list[str] = []
    used = 0
    for index in range(1, page_count + 1):
        if used >= limits.max_text_chars:
            break
        try:
            text = reader.pages[index - 1].extract_text() or ""
        except MemoryError:
            raise
        except Exception as exc:
            if type(exc).__name__ == "LimitReachedError":
                raise ExtractionFailure("resource_limit") from exc
            # One damaged page does not stop the others; OCR may still read it.
            continue
        used = _append_capped(parts, used, index, text, limits.max_text_chars)
    return "\n".join(parts).strip()[: limits.max_text_chars]


def _check_page_sizes(reader: Any, page_count: int, limits: ParserLimits) -> None:
    scale = limits.ocr_dpi / POINTS_PER_INCH
    for index in range(page_count):
        try:
            page = reader.pages[index]
            box = page.mediabox
            unit = float(page.user_unit or 1)
            width = abs(float(box.width)) * unit * scale
            height = abs(float(box.height)) * unit * scale
        except MemoryError:
            raise
        except Exception as exc:
            raise ExtractionFailure("malformed") from exc
        if width * height > limits.max_page_pixels:
            raise ExtractionFailure("page_too_large")


def extract_ocr_text(
    reader: Any, data: bytes, page_count: int, languages: list[str], limits: ParserLimits
) -> str:
    """Renders and reads one page at a time, so only one page image is in memory."""
    import pytesseract
    from pdf2image import convert_from_path
    from PIL import Image

    _check_page_sizes(reader, page_count, limits)
    # Pillow refuses images above twice this size; the page check above runs first.
    Image.MAX_IMAGE_PIXELS = limits.max_page_pixels
    tesseract_lang = "+".join(TESSERACT_LANGUAGES.get(item, "eng") for item in languages) or "eng"

    parts: list[str] = []
    used = 0
    with tempfile.TemporaryDirectory(prefix="pension-parser-") as workdir:
        pdf_path = Path(workdir) / "document.pdf"
        pdf_path.write_bytes(data)
        for index in range(1, page_count + 1):
            if used >= limits.max_text_chars:
                break
            try:
                images = convert_from_path(
                    str(pdf_path),
                    dpi=limits.ocr_dpi,
                    first_page=index,
                    last_page=index,
                    grayscale=True,
                )
            except Image.DecompressionBombError as exc:
                raise ExtractionFailure("page_too_large") from exc
            except MemoryError:
                raise
            except Exception as exc:
                raise ExtractionFailure("malformed") from exc
            for image in images:
                try:
                    text = pytesseract.image_to_string(image, lang=tesseract_lang)
                except MemoryError:
                    raise
                except Exception as exc:
                    raise ExtractionFailure("ocr_failed") from exc
                finally:
                    image.close()
                used = _append_capped(parts, used, index, text, limits.max_text_chars)
    return "\n".join(parts).strip()[: limits.max_text_chars]


def extract(data: bytes, languages: list[str], limits: ParserLimits) -> dict[str, Any]:
    reader = _open_reader(data)
    page_count = _page_count(reader, limits)
    text = extract_embedded_text(reader, page_count, limits)
    method = "text"
    if len(text) < MIN_TEXT_LENGTH:
        text = extract_ocr_text(reader, data, page_count, languages, limits)
        method = "ocr"
    if not text:
        raise ExtractionFailure("no_text")
    return {"text": text, "method": method, "pages": page_count}


def _peak_rss_kb(who: int) -> int:
    peak = resource.getrusage(who).ru_maxrss
    # Linux reports kilobytes, macOS bytes.
    return int(peak / 1024) if sys.platform == "darwin" else int(peak)


def main() -> int:
    started = time.monotonic()
    header, data = _read_input(sys.stdin.buffer)
    limits = ParserLimits.from_json(header.get("limits", {}))
    apply_resource_limits(limits)
    languages = [str(item) for item in header.get("languages", ["en", "nl"])]

    try:
        result: dict[str, Any] = {"ok": True, **extract(data, languages, limits)}
    except ExtractionFailure as failure:
        result = {"ok": False, "code": failure.code}
    except MemoryError:
        result = {"ok": False, "code": "resource_limit"}
    except RecursionError:
        result = {"ok": False, "code": "malformed"}
    except Exception:
        # The exception text can quote the document; the code is enough.
        result = {"ok": False, "code": "extraction_failed"}

    result["stats"] = {
        "elapsedMs": int((time.monotonic() - started) * 1000),
        "peakRssKb": _peak_rss_kb(resource.RUSAGE_SELF),
        "childPeakRssKb": _peak_rss_kb(resource.RUSAGE_CHILDREN),
    }
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
