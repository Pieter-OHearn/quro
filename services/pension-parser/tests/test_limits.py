from __future__ import annotations

import pytest

from app.limits import MIB, LimitsError, ParserLimits, load_limits


def test_defaults_apply_when_nothing_is_set():
    assert load_limits({}) == ParserLimits()


def test_settings_are_read_in_their_units():
    limits = load_limits(
        {"PARSER_MAX_FILE_MB": "5", "PARSER_MEMORY_MB": "512", "PARSER_MAX_QUEUE": "0"}
    )
    assert limits.max_file_bytes == 5 * MIB
    assert limits.memory_bytes == 512 * MIB
    assert limits.max_queue == 0


def test_invalid_settings_stop_startup_and_are_all_named():
    with pytest.raises(LimitsError) as caught:
        load_limits(
            {"PARSER_MAX_PAGES": "0", "PARSER_TIMEOUT_SECONDS": "ten", "PARSER_CPU_SECONDS": "-1"}
        )
    message = str(caught.value)
    for name in ("PARSER_MAX_PAGES", "PARSER_TIMEOUT_SECONDS", "PARSER_CPU_SECONDS"):
        assert name in message
    # Values are not echoed.
    assert "ten" not in message


def test_limits_survive_the_trip_to_the_extraction_process():
    limits = ParserLimits(max_pages=7, memory_bytes=300 * MIB)
    assert ParserLimits.from_json(limits.to_json()) == limits
