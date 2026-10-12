"""Starts the parser: `python -m app`. Binds 0.0.0.0:8080 unless PARSER_HOST/PARSER_PORT say
otherwise, and refuses connections beyond what the extraction queue can hold."""

from __future__ import annotations

import logging
import os

import uvicorn

from app.limits import load_limits

# Health checks and a request being refused still need a connection each.
SPARE_CONNECTIONS = 4


def main() -> None:
    # Extraction outcomes (code, pages, elapsed time, peak memory; never document text).
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s %(message)s")
    limits = load_limits()
    uvicorn.run(
        "app.main:app",
        host=os.getenv("PARSER_HOST", "0.0.0.0"),
        port=int(os.getenv("PARSER_PORT", "8080")),
        limit_concurrency=limits.max_concurrency + limits.max_queue + SPARE_CONNECTIONS,
        timeout_keep_alive=5,
        server_header=False,
    )


if __name__ == "__main__":
    main()
