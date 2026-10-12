"""Resource bounds for document processing.

Every bound has a default that suits a pension statement of a few pages and can be changed with
an environment variable. A value that is not a positive whole number stops the service at
startup instead of silently falling back, so a typo never lifts a bound.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import asdict, dataclass

MIB = 1024 * 1024


@dataclass(frozen=True)
class ParserLimits:
    # Upload size; the backend refuses larger PDFs before they reach the parser.
    max_file_bytes: int = 20 * MIB
    # Pages in one document.
    max_pages: int = 30
    # Pixels of one page rendered for OCR (width x height at ocr_dpi).
    max_page_pixels: int = 40_000_000
    # Characters of extracted text kept and sent to the model.
    max_text_chars: int = 80_000
    # Resolution pages are rendered at for OCR.
    ocr_dpi: int = 250
    # Wall-clock time for one extraction; the extraction process is killed when it runs out.
    timeout_seconds: int = 100
    # CPU time for each process of an extraction (the extractor, the renderer, OCR).
    cpu_seconds: int = 100
    # Address space for each process of an extraction.
    memory_bytes: int = 1024 * MIB
    # Extractions that run at the same time.
    max_concurrency: int = 1
    # Extractions that may wait for a free slot; more are answered 503 at once.
    max_queue: int = 2

    def to_json(self) -> dict[str, int]:
        return asdict(self)

    @classmethod
    def from_json(cls, values: Mapping[str, object]) -> ParserLimits:
        known = {name: int(values[name]) for name in cls.__dataclass_fields__ if name in values}
        return cls(**known)


# Setting name -> (field, multiplier from the setting's unit to the field's unit).
SETTINGS: dict[str, tuple[str, int]] = {
    "PARSER_MAX_FILE_MB": ("max_file_bytes", MIB),
    "PARSER_MAX_PAGES": ("max_pages", 1),
    "PARSER_MAX_PAGE_PIXELS": ("max_page_pixels", 1),
    "PARSER_MAX_TEXT_CHARS": ("max_text_chars", 1),
    "PARSER_OCR_DPI": ("ocr_dpi", 1),
    "PARSER_TIMEOUT_SECONDS": ("timeout_seconds", 1),
    "PARSER_CPU_SECONDS": ("cpu_seconds", 1),
    "PARSER_MEMORY_MB": ("memory_bytes", MIB),
    "PARSER_MAX_CONCURRENCY": ("max_concurrency", 1),
    "PARSER_MAX_QUEUE": ("max_queue", 1),
}

# The queue may be empty; every other bound must be at least 1.
_ZERO_ALLOWED = {"PARSER_MAX_QUEUE"}


class LimitsError(ValueError):
    pass


def load_limits(env: Mapping[str, str] | None = None) -> ParserLimits:
    """Reads the bounds from the environment. Lists every invalid setting by name."""
    source = os.environ if env is None else env
    values: dict[str, int] = {}
    problems: list[str] = []
    for name, (field, unit) in SETTINGS.items():
        raw = source.get(name, "").strip()
        if not raw:
            continue
        minimum = 0 if name in _ZERO_ALLOWED else 1
        if not raw.isdigit() or int(raw) < minimum:
            problems.append(f"{name} must be a whole number of at least {minimum}")
            continue
        values[field] = int(raw) * unit
    if problems:
        raise LimitsError("; ".join(problems))
    return ParserLimits(**values)
