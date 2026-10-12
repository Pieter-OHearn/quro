"""The HTTP surface: fixed error bodies, the size bound, the busy answer, the health check
during an extraction and cancellation when the client goes away."""

from __future__ import annotations

import socket
import threading
import time

import httpx
import pdf_factory as pdfs
import pytest
import uvicorn
from fastapi.testclient import TestClient
from test_extraction import group_members, needs_linux

from app import main
from app.extraction import AdmissionGate

client = TestClient(main.app)


def post_pdf(data: bytes, name: str = "statement.pdf", http=client, **kwargs):
    return http.post(
        "/v1/extract",
        files={"file": (name, data, "application/pdf")},
        data={"provider": "Synthetic Fund", "currency": "EUR"},
        **kwargs,
    )


def assert_fixed_error(response, status: int, code: str):
    assert response.status_code == status
    body = response.json()
    assert body == {"detail": {"code": code, "message": body["detail"]["message"]}}
    text = response.text
    for leak in ("Traceback", "pypdf", "Synthetic", 'File "'):
        assert leak not in text


def test_extracts_rows_from_a_synthetic_statement():
    response = post_pdf(pdfs.statement_pdf())
    assert response.status_code == 200
    body = response.json()
    assert body["statementPeriodStart"] == "2025-01-01"
    assert body["statementPeriodEnd"] == "2025-12-31"
    types = sorted({row["type"] for row in body["rows"]})
    assert types == ["annual_statement", "contribution", "fee"]


def test_health_answers():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("name", "data", "status", "code"),
    [
        ("statement.txt", b"%PDF-1.7", 400, "invalid_upload"),
        ("empty.pdf", b"", 400, "invalid_upload"),
        ("garbage.pdf", pdfs.garbage_pdf(), 422, "malformed"),
        ("truncated.pdf", pdfs.truncated_pdf(), 422, "malformed"),
        ("encrypted.pdf", pdfs.encrypted_pdf(), 422, "encrypted"),
        ("pages.pdf", pdfs.blank_pdf(pages=6), 422, "too_many_pages"),
        ("bomb.pdf", pdfs.decompression_bomb_pdf(), 422, "resource_limit"),
    ],
)
def test_refusals_have_a_fixed_body(name, data, status, code):
    assert_fixed_error(post_pdf(data, name), status, code)


def test_a_body_above_the_size_bound_is_refused_before_it_is_read():
    response = post_pdf(b"%PDF-1.7\n" + b"0" * (3 * 1024 * 1024))
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "file_too_large"


def test_a_full_queue_answers_busy(monkeypatch):
    monkeypatch.setattr(main, "GATE", AdmissionGate(concurrency=1, queue=0))
    gate = main.GATE
    gate._admitted = 1  # one extraction is running
    response = post_pdf(pdfs.statement_pdf())
    assert_fixed_error(response, 503, "busy")
    assert response.headers["retry-after"] == "5"


def test_a_model_failure_without_fallback_is_a_fixed_502(monkeypatch):
    monkeypatch.setenv("PARSER_REGEX_ONLY", "false")
    monkeypatch.setenv("PARSER_ALLOW_REGEX_FALLBACK", "false")
    assert_fixed_error(post_pdf(pdfs.statement_pdf()), 502, "model_failed")


class _Server:
    """The app on a real socket, so a client can go away mid-request."""

    def __init__(self):
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        self.port = sock.getsockname()[1]
        sock.close()
        self.server = uvicorn.Server(
            uvicorn.Config(main.app, host="127.0.0.1", port=self.port, log_level="warning")
        )
        self.thread = threading.Thread(target=self.server.run, daemon=True)

    def __enter__(self):
        self.thread.start()
        deadline = time.monotonic() + 10
        while not self.server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        return f"http://127.0.0.1:{self.port}"

    def __exit__(self, *exc):
        self.server.should_exit = True
        self.thread.join(timeout=10)


def _extractor_groups() -> list[int]:
    """Process groups led by an extraction process of this test run."""
    from pathlib import Path

    groups = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            cmdline = (entry / "cmdline").read_bytes()
        except OSError:
            continue
        if b"app.extract_worker" in cmdline:
            groups.append(int(entry.name))
    return groups


@needs_linux
def test_health_is_answered_while_a_document_is_read_and_a_client_disconnect_stops_it():
    slow = pdfs.slow_text_pdf(operations=100_000)
    with _Server() as base_url:
        failures: list[BaseException] = []

        def upload():
            try:
                with httpx.Client(base_url=base_url, timeout=2.5) as http:
                    post_pdf(slow, http=http)
            except httpx.TimeoutException:
                pass  # the client gives up, as the backend does at its own timeout
            except BaseException as error:  # pragma: no cover - reported below
                failures.append(error)

        uploader = threading.Thread(target=upload)
        uploader.start()
        deadline = time.monotonic() + 5
        while not _extractor_groups() and time.monotonic() < deadline:
            time.sleep(0.05)
        groups = _extractor_groups()
        assert groups, "the extraction process did not start"

        started = time.monotonic()
        health = httpx.get(f"{base_url}/health", timeout=2)
        health_ms = (time.monotonic() - started) * 1000
        assert health.json() == {"status": "ok"}
        assert health_ms < 500, health_ms

        uploader.join(timeout=10)
        assert not failures
        # The server notices the closed connection and kills the extraction's process group.
        deadline = time.monotonic() + 5
        while any(group_members(group) for group in groups) and time.monotonic() < deadline:
            time.sleep(0.1)
        assert all(group_members(group) == [] for group in groups)
