"""Extraction runs in a bounded child process. Each test feeds one synthetic PDF and checks the
fixed failure code, that nothing outlives the extraction, and records elapsed time and peak
memory."""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import time
from dataclasses import replace
from pathlib import Path

import pdf_factory as pdfs
import pytest
from conftest import record

from app.extraction import AdmissionGate, ExtractionError, extract_text
from app.limits import MIB, ParserLimits

LINUX = sys.platform.startswith("linux")
HAS_OCR = shutil.which("pdftoppm") is not None and shutil.which("tesseract") is not None
needs_linux = pytest.mark.skipif(not LINUX, reason="process limits and /proc need Linux")
needs_ocr = pytest.mark.skipif(not HAS_OCR, reason="poppler-utils and tesseract are not installed")

LIMITS = ParserLimits(
    max_file_bytes=2 * MIB,
    max_pages=5,
    timeout_seconds=30,
    cpu_seconds=30,
    memory_bytes=1024 * MIB,
)


def run(data: bytes, limits: ParserLimits = LIMITS, languages=("en", "nl"), **kwargs):
    return asyncio.run(extract_text(data, list(languages), limits, **kwargs))


def expect_failure(name: str, data: bytes, code: str, limits: ParserLimits = LIMITS):
    started = time.monotonic()
    with pytest.raises(ExtractionError) as caught:
        run(data, limits)
    elapsed = int((time.monotonic() - started) * 1000)
    stats = caught.value.stats
    record(name, code, elapsed, stats.get("peakRssKb"), stats.get("childPeakRssKb"))
    assert caught.value.code == code
    # The message is fixed text: it never quotes the document or the parser library.
    assert "Synthetic" not in caught.value.message
    assert "Traceback" not in caught.value.message
    return caught.value


def group_members(pgid: int) -> list[str]:
    """Names of live (non-zombie) processes in a process group, read from /proc."""
    names = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = (entry / "stat").read_text()
        except OSError:
            continue
        # comm may contain spaces; the fields after the closing parenthesis are fixed.
        name = stat[stat.index("(") + 1 : stat.rindex(")")]
        fields = stat[stat.rindex(")") + 2 :].split()
        state, process_group = fields[0], int(fields[2])
        if process_group == pgid and state != "Z":
            names.append(name)
    return names


def test_reads_the_text_layer_of_a_synthetic_statement():
    started = time.monotonic()
    result = run(pdfs.statement_pdf(pages=2))
    record(
        "text layer, 2 pages",
        "ok",
        int((time.monotonic() - started) * 1000),
        result.peak_rss_kb,
        result.child_peak_rss_kb,
    )
    assert result.method == "text"
    assert result.pages == 2
    assert "Employer contribution 500.00" in result.text
    assert "[Page 2]" in result.text


def test_caps_the_extracted_text():
    result = run(pdfs.statement_pdf(pages=5), replace(LIMITS, max_text_chars=600))
    assert len(result.text) <= 600


def test_refuses_a_file_that_is_not_a_pdf():
    expect_failure("not a PDF", b"plain text, no PDF header" * 20, "not_pdf")


def test_refuses_a_malformed_pdf():
    expect_failure("malformed", pdfs.garbage_pdf(), "malformed")


def test_refuses_a_truncated_pdf():
    expect_failure("truncated", pdfs.truncated_pdf(), "malformed")


def test_refuses_a_password_protected_pdf():
    expect_failure("encrypted (user password)", pdfs.encrypted_pdf(), "encrypted")


def test_reads_a_pdf_protected_only_against_changes():
    # An empty user password opens the document; only the owner password is set.
    result = run(pdfs.encrypted_pdf(user_password=""))
    assert "Annual investment return" in result.text


def test_refuses_too_many_pages():
    expect_failure("too many pages (6 > 5)", pdfs.blank_pdf(pages=6), "too_many_pages")


def test_refuses_an_oversized_file_before_starting_a_process():
    expect_failure(
        "file above the size bound",
        pdfs.statement_pdf() + b"%" * (2 * MIB),
        "file_too_large",
    )


@needs_ocr
def test_refuses_a_huge_page_before_rendering_it():
    # 200 x 200 inches: 2.5 billion pixels at 250 dpi.
    expect_failure("huge page", pdfs.blank_pdf(size=(14_400, 14_400)), "page_too_large")


@needs_ocr
def test_refuses_a_huge_page_scaled_by_user_unit():
    expect_failure(
        "huge page via UserUnit",
        pdfs.blank_pdf(size=pdfs.LETTER, user_unit=75),
        "page_too_large",
    )


def test_stops_a_decompression_bomb():
    # 200 MB of content stream inside a file of about 200 KB.
    data = pdfs.decompression_bomb_pdf(expanded_mb=200)
    assert len(data) < 400_000
    expect_failure("decompression bomb (200 MB)", data, "resource_limit")


@needs_linux
def test_the_memory_bound_stops_an_extraction():
    # 70 MB of content stream is below the PDF library's own bound but not below this one.
    limits = replace(LIMITS, memory_bytes=160 * MIB)
    expect_failure(
        "70 MB stream, 160 MB memory bound",
        pdfs.decompression_bomb_pdf(expanded_mb=70),
        "resource_limit",
        limits,
    )


@needs_linux
def test_a_timeout_kills_the_extraction_process():
    pids: list[int] = []
    limits = replace(LIMITS, timeout_seconds=1)
    started = time.monotonic()
    with pytest.raises(ExtractionError) as caught:
        run(pdfs.slow_text_pdf(operations=100_000), limits, on_start=pids.append)
    elapsed = time.monotonic() - started
    record("timeout (1 s bound)", "timeout", int(elapsed * 1000))
    assert caught.value.code == "timeout"
    assert elapsed < 3
    assert pids and group_members(pids[0]) == []
    with pytest.raises(ProcessLookupError):
        os.kill(pids[0], 0)


@needs_linux
def test_the_cpu_bound_stops_an_extraction():
    limits = replace(LIMITS, cpu_seconds=1, timeout_seconds=30)
    error = expect_failure(
        "CPU bound (1 s)", pdfs.slow_text_pdf(operations=100_000), "resource_limit", limits
    )
    assert error.stats.get("elapsedMs", 0) < 10_000


@needs_ocr
def test_reads_a_scanned_page_with_ocr():
    started = time.monotonic()
    # English only: a development machine may lack the Dutch language data the image ships.
    result = run(
        pdfs.short_text_pdf(("ANNUAL STATEMENT 2025", "CONTRIBUTION 250.00")), languages=["en"]
    )
    record(
        "OCR, 1 page",
        "ok",
        int((time.monotonic() - started) * 1000),
        result.peak_rss_kb,
        result.child_peak_rss_kb,
    )
    assert result.method == "ocr"
    assert "STATEMENT" in result.text.upper()


@needs_ocr
@needs_linux
def test_a_timeout_during_ocr_kills_the_renderer_and_ocr_processes_too():
    # Five A4 pages rendered at 600 dpi take far longer than the bound.
    limits = replace(LIMITS, timeout_seconds=3, ocr_dpi=600)
    seen: set[str] = set()
    pids: list[int] = []

    async def scenario():
        task = asyncio.ensure_future(
            extract_text(pdfs.short_text_pdf(pages=5), ["en"], limits, on_start=pids.append)
        )
        while not task.done():
            if pids:
                seen.update(group_members(pids[0]))
            await asyncio.sleep(0.05)
        return await task

    started = time.monotonic()
    with pytest.raises(ExtractionError) as caught:
        asyncio.run(scenario())
    record("OCR timeout (3 s bound)", "timeout", int((time.monotonic() - started) * 1000))
    assert caught.value.code == "timeout"
    assert seen & {"pdftoppm", "tesseract"}, seen
    assert group_members(pids[0]) == []


@needs_linux
def test_a_cancelled_request_kills_the_extraction_process():
    pids: list[int] = []

    async def scenario():
        task = asyncio.ensure_future(
            extract_text(
                pdfs.slow_text_pdf(operations=100_000), ["en"], LIMITS, on_start=pids.append
            )
        )
        await asyncio.sleep(0.5)
        assert pids and group_members(pids[0])
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(scenario())
    assert group_members(pids[0]) == []


def test_unrelated_work_keeps_running_during_an_extraction():
    """The event loop only waits on the child: a timer keeps ticking while a PDF is read."""

    async def scenario():
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.05)
                ticks += 1

        ticking = asyncio.ensure_future(ticker())
        started = time.monotonic()
        await extract_text(pdfs.slow_text_pdf(operations=40_000), ["en"], LIMITS)
        elapsed = time.monotonic() - started
        ticking.cancel()
        return ticks, elapsed

    ticks, elapsed = asyncio.run(scenario())
    # At least half the ticks a free loop would make in that time.
    assert elapsed > 0.5
    assert ticks >= int(elapsed / 0.05 / 2)


def test_the_admission_gate_bounds_running_and_waiting_extractions():
    async def scenario():
        gate = AdmissionGate(concurrency=1, queue=1)
        release = asyncio.Event()
        running = 0
        peak = 0

        async def job():
            nonlocal running, peak
            async with gate.slot():
                running += 1
                peak = max(peak, running)
                await release.wait()
                running -= 1

        first = asyncio.ensure_future(job())
        second = asyncio.ensure_future(job())
        await asyncio.sleep(0.05)
        with pytest.raises(ExtractionError) as refused:
            async with gate.slot():
                pass
        release.set()
        await asyncio.gather(first, second)
        # Slots are given back once the work is done.
        async with gate.slot():
            pass
        return refused.value.code, peak, gate.admitted

    code, peak, admitted = asyncio.run(scenario())
    assert code == "busy"
    assert peak == 1
    assert admitted == 0
