"""Runs text extraction off the event loop, in a bounded process per document.

The event loop only writes the document to a child process and waits for it, so the health
check and other requests are answered while a document is read. Each child runs in its own
process group: when the wall-clock bound runs out, or the request is cancelled because the
client went away, the whole group (the extractor, the renderer and OCR) is killed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from app.limits import ParserLimits

logger = logging.getLogger("pension-parser")

APP_ROOT = Path(__file__).resolve().parent.parent
# The child gets only what it needs, never the service's model settings.
CHILD_ENV_KEYS = ("PATH", "TMPDIR", "LANG", "LC_ALL", "TESSDATA_PREFIX")
# Exit status of a child killed by a signal, e.g. SIGKILL from the kernel's memory limit or
# SIGXCPU from the CPU limit.
SIGNAL_EXIT = "resource_limit"

# Failure code -> (HTTP status, message). Messages are fixed: none quotes the document.
FAILURES: dict[str, tuple[int, str]] = {
    "invalid_upload": (400, "Upload one non-empty PDF file"),
    "file_too_large": (413, "The PDF is larger than the parser accepts"),
    "not_pdf": (422, "The file is not a PDF"),
    "malformed": (422, "The PDF is damaged or cannot be read"),
    "encrypted": (422, "The PDF is password protected"),
    "too_many_pages": (422, "The PDF has more pages than the parser accepts"),
    "page_too_large": (422, "A page of the PDF is larger than the parser accepts"),
    "no_text": (422, "No text could be read from the PDF"),
    "ocr_failed": (422, "Text recognition failed for the PDF"),
    "resource_limit": (422, "Reading the PDF needed more memory or CPU than the parser allows"),
    "timeout": (422, "Reading the PDF took longer than the parser allows"),
    "extraction_failed": (422, "The PDF could not be read"),
    "busy": (503, "The parser is busy; try again shortly"),
    "model_failed": (502, "The extraction model did not answer"),
}


class ExtractionError(Exception):
    def __init__(self, code: str, stats: dict[str, object] | None = None) -> None:
        super().__init__(code)
        self.code = code
        # Elapsed time and peak memory of the extraction, when it got far enough to report them.
        self.stats = stats or {}

    @property
    def status(self) -> int:
        return FAILURES[self.code][0]

    @property
    def message(self) -> str:
        return FAILURES[self.code][1]


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    method: str
    pages: int
    elapsed_ms: int
    peak_rss_kb: int
    child_peak_rss_kb: int


class AdmissionGate:
    """At most `concurrency` extractions run and `queue` wait; the rest are refused at once."""

    def __init__(self, concurrency: int, queue: int) -> None:
        self._capacity = concurrency + queue
        self._concurrency = concurrency
        self._admitted = 0
        self._semaphore: asyncio.Semaphore | None = None

    @property
    def admitted(self) -> int:
        return self._admitted

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        if self._admitted >= self._capacity:
            raise ExtractionError("busy")
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self._concurrency)
        self._admitted += 1
        try:
            async with self._semaphore:
                yield
        finally:
            self._admitted -= 1


def _child_env() -> dict[str, str]:
    env = {key: os.environ[key] for key in CHILD_ENV_KEYS if key in os.environ}
    # One thread per OCR process: the CPU bound then holds per document.
    env["OMP_THREAD_LIMIT"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def _kill_group(process: asyncio.subprocess.Process) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _parse_child_output(stdout: bytes, returncode: int | None) -> dict[str, object]:
    if returncode is not None and returncode < 0:
        raise ExtractionError(SIGNAL_EXIT, {"signal": -returncode})
    try:
        result = json.loads(stdout)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ExtractionError("extraction_failed") from exc
    if not isinstance(result, dict):
        raise ExtractionError("extraction_failed")
    return result


async def extract_text(
    data: bytes,
    languages: list[str],
    limits: ParserLimits,
    *,
    on_start: Callable[[int], None] | None = None,
) -> ExtractionResult:
    """Extracts the text of one PDF. Raises ExtractionError with a fixed code on failure."""
    if len(data) > limits.max_file_bytes:
        raise ExtractionError("file_too_large")

    started = time.monotonic()
    header = json.dumps({"languages": languages, "limits": limits.to_json()}).encode() + b"\n"
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "app.extract_worker",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        # Tracebacks may quote the document; they are not kept.
        stderr=asyncio.subprocess.DEVNULL,
        cwd=str(APP_ROOT),
        env=_child_env(),
        start_new_session=True,
    )
    if on_start is not None:
        on_start(process.pid)

    try:
        stdout, _ = await asyncio.wait_for(
            process.communicate(header + data), timeout=limits.timeout_seconds
        )
    except asyncio.TimeoutError as exc:
        _kill_group(process)
        await process.wait()
        logger.warning(
            "extraction stopped after %ss (timeout), process group killed", limits.timeout_seconds
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        raise ExtractionError("timeout", {"elapsedMs": elapsed_ms}) from exc
    except BaseException:
        # Cancelled (the client went away) or failed: stop the work too.
        _kill_group(process)
        await process.wait()
        raise
    finally:
        # A finished extractor may leave a renderer or OCR process behind; none may outlive it.
        _kill_group(process)

    elapsed_ms = int((time.monotonic() - started) * 1000)
    try:
        result = _parse_child_output(stdout, process.returncode)
    except ExtractionError as error:
        error.stats["elapsedMs"] = elapsed_ms
        logger.info("extraction failed code=%s elapsed_ms=%s", error.code, elapsed_ms)
        raise
    stats = result.get("stats") if isinstance(result.get("stats"), dict) else {}
    if not result.get("ok"):
        code = str(result.get("code"))
        logger.info(
            "extraction refused code=%s elapsed_ms=%s peak_rss_kb=%s child_peak_rss_kb=%s",
            code,
            elapsed_ms,
            stats.get("peakRssKb"),
            stats.get("childPeakRssKb"),
        )
        raise ExtractionError(
            code if code in FAILURES else "extraction_failed", {**stats, "elapsedMs": elapsed_ms}
        )

    text = str(result.get("text", ""))
    extracted = ExtractionResult(
        text=text,
        method=str(result.get("method", "text")),
        pages=int(result.get("pages", 0)),
        elapsed_ms=elapsed_ms,
        peak_rss_kb=int(stats.get("peakRssKb", 0)),
        child_peak_rss_kb=int(stats.get("childPeakRssKb", 0)),
    )
    logger.info(
        "extraction finished method=%s pages=%s chars=%s elapsed_ms=%s peak_rss_kb=%s "
        "child_peak_rss_kb=%s",
        extracted.method,
        extracted.pages,
        len(text),
        extracted.elapsed_ms,
        extracted.peak_rss_kb,
        extracted.child_peak_rss_kb,
    )
    return extracted
