"""Refuses request bodies above a size before they are parsed or spooled to disk."""

from __future__ import annotations

import json
from typing import Any

Scope = dict[str, Any]
Message = dict[str, Any]

TOO_LARGE_BODY = json.dumps(
    {"detail": {"code": "file_too_large", "message": "The PDF is larger than the parser accepts"}}
).encode()


class _BodyTooLarge(Exception):
    pass


class BodySizeLimit:
    """ASGI middleware: a declared or streamed body above `max_bytes` is answered 413."""

    def __init__(self, app: Any, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None:
            try:
                length = int(declared)
            except ValueError:
                length = -1
            if length < 0 or length > self.max_bytes:
                await _reject(send)
                return

        received = 0
        started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message.get("type") == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await _reject(send)


async def _reject(send: Any) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(TOO_LARGE_BODY)).encode()),
                (b"connection", b"close"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": TOO_LARGE_BODY})
