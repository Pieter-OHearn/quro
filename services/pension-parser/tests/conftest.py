"""Test settings for the parser. Bounds are set before the app is imported, because the service
reads them once at startup."""

from __future__ import annotations

import os
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ.update(
    {
        "PARSER_MAX_FILE_MB": "2",
        "PARSER_MAX_PAGES": "5",
        "PARSER_TIMEOUT_SECONDS": "30",
        "PARSER_MAX_CONCURRENCY": "1",
        "PARSER_MAX_QUEUE": "1",
        # No model in tests: the deterministic extractor answers.
        "PARSER_REGEX_ONLY": "true",
        "VLLM_BASE_URL": "http://127.0.0.1:9",
    }
)

# name -> (outcome, elapsed ms, peak RSS of the extractor in KiB, peak RSS of renderer/OCR)
MEASUREMENTS: list[tuple[str, str, int, int | None, int | None]] = []


def record(name: str, outcome: str, elapsed_ms: int, peak_kb=None, child_peak_kb=None) -> None:
    MEASUREMENTS.append((name, outcome, elapsed_ms, peak_kb, child_peak_kb))


def pytest_terminal_summary(terminalreporter) -> None:
    if not MEASUREMENTS:
        return
    terminalreporter.section("extraction measurements")
    terminalreporter.write_line(
        f"{'case':<34} {'outcome':<16} {'elapsed ms':>10} {'peak KiB':>10} {'OCR peak KiB':>12}"
    )
    for name, outcome, elapsed, peak, child in MEASUREMENTS:
        terminalreporter.write_line(
            f"{name:<34} {outcome:<16} {elapsed:>10} {peak if peak is not None else '-':>10} "
            f"{child if child is not None else '-':>12}"
        )
