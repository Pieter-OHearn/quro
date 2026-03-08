from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from typing import Any

import httpx
import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pdf2image import convert_from_bytes
from pypdf import PdfReader

app = FastAPI(title="Pension Parser")
logger = logging.getLogger("pension-parser")

ALLOWED_TYPES = {"contribution", "fee", "annual_statement"}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MIN_TEXT_LENGTH = 400
MAX_TEXT_CHARS = 80_000
VLLM_TIMEOUT_SECONDS_DEFAULT = 180.0
REGEX_FALLBACK_DATE_PATTERNS = ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d")


@dataclass
class ParsedRow:
    type: str
    amount: float
    tax_amount: float
    row_date: str
    note: str
    is_employer: bool | None
    confidence: float
    confidence_label: str
    evidence: list[dict[str, Any]]
    is_derived: bool


def _to_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        raw = re.sub(r"[^0-9,.\-+]", "", str(value))
        if not raw:
            return 0.0

        if "," in raw and "." in raw:
            if raw.rfind(",") > raw.rfind("."):
                normalized = raw.replace(".", "").replace(",", ".")
            else:
                normalized = raw.replace(",", "")
            return float(normalized)

        if "," in raw:
            if raw.count(",") == 1 and len(raw.split(",")[-1]) <= 2:
                return float(raw.replace(",", "."))
            return float(raw.replace(",", ""))

        return float(raw)
    except Exception:
        return 0.0


def _is_iso_date(value: Any) -> bool:
    return isinstance(value, str) and bool(ISO_DATE_RE.match(value))


def _clamp_confidence(value: Any) -> float:
    numeric = _to_float(value)
    if numeric < 0:
        return 0.0
    if numeric > 1:
        return 1.0
    return numeric


def _confidence_label(conf: float, raw: Any) -> str:
    if raw in {"high", "medium", "low"}:
        return str(raw)
    if conf >= 0.85:
        return "high"
    if conf >= 0.65:
        return "medium"
    return "low"


def _safe_note(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _parse_language_hints(raw: str | None) -> list[str]:
    if not raw:
        return ["en", "nl"]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            values = [str(item).strip().lower() for item in parsed if str(item).strip()]
            return values or ["en", "nl"]
    except Exception:
        pass
    return ["en", "nl"]


def _read_positive_float_env(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _read_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "y", "on"}


def _to_iso_date(value: str | None) -> str | None:
    if not value:
        return None
    token = value.strip()
    if _is_iso_date(token):
        return token

    for pattern in REGEX_FALLBACK_DATE_PATTERNS:
        try:
            parsed = datetime.strptime(token, pattern)
            return parsed.date().isoformat()
        except ValueError:
            continue
    return None


def _extract_first_amount(line: str) -> float | None:
    matches = re.findall(r"[-+]?\d[\d,.]*", line)
    if not matches:
        return None
    # In statement lines, the last amount token is usually the transaction value.
    return _to_float(matches[-1])


def _extract_period_from_text(text: str) -> tuple[str | None, str | None]:
    period_match = re.search(
        r"statement\s+period\s*:\s*(?P<start>[0-9/\-]+)\s*(?:to|until|-)\s*(?P<end>[0-9/\-]+)",
        text,
        flags=re.IGNORECASE,
    )
    if not period_match:
        return None, None
    return _to_iso_date(period_match.group("start")), _to_iso_date(period_match.group("end"))


def _extract_balance_from_text(label: str, text: str) -> float | None:
    escaped_label = re.escape(label)
    pattern = rf"{escaped_label}\s*[:\-]?\s*([-+]?\d[\d,.\s]*)"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match and label.lower() == "opening balance":
        match = re.search(
            r"opening[\w\s]{0,24}balance\s*[:\-]?\s*([-+]?\d[\d,.\s]*)",
            text,
            flags=re.IGNORECASE,
        )
    if not match and label.lower() == "closing balance":
        match = re.search(
            r"closing[\w\s]{0,24}balance\s*[:\-]?\s*([-+]?\d[\d,.\s]*)",
            text,
            flags=re.IGNORECASE,
        )
    if not match:
        return None
    return _to_float(match.group(1))


def _build_regex_fallback_payload(
    text: str,
    period_start_hint: str | None,
    period_end_hint: str | None,
    opening_hint: float | None,
    closing_hint: float | None,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for line in lines:
        normalized = line.lower()
        amount = _extract_first_amount(line)
        if amount is None:
            continue

        date_match = re.search(
            r"(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4}|\d{4}/\d{2}/\d{2})",
            line,
        )
        row_date = _to_iso_date(date_match.group(1)) if date_match else period_end_hint
        if not row_date:
            row_date = date.today().isoformat()

        if "contribution" in normalized:
            rows.append(
                {
                    "type": "contribution",
                    "amount": abs(amount),
                    "taxAmount": 0.0,
                    "date": row_date,
                    "note": line,
                    "isEmployer": "employer" in normalized
                    if ("employer" in normalized or "employee" in normalized)
                    else None,
                    "confidence": 0.7,
                    "confidenceLabel": "medium",
                    "evidence": [{"page": None, "snippet": line[:180]}],
                    "isDerived": False,
                }
            )
            continue

        if "fee" in normalized:
            rows.append(
                {
                    "type": "fee",
                    "amount": abs(amount),
                    "taxAmount": 0.0,
                    "date": row_date,
                    "note": line,
                    "isEmployer": None,
                    "confidence": 0.72,
                    "confidenceLabel": "medium",
                    "evidence": [{"page": None, "snippet": line[:180]}],
                    "isDerived": False,
                }
            )
            continue

        if (
            "annual investment return" in normalized
            or "annual statement" in normalized
            or "investment gain" in normalized
            or "investment loss" in normalized
            or "investment return" in normalized
            or "net return" in normalized
            or "performance" in normalized
            or "earnings" in normalized
            or "gain" in normalized
            or "loss" in normalized
        ):
            signed_amount = amount
            if "loss" in normalized and signed_amount > 0:
                signed_amount = -signed_amount
            rows.append(
                {
                    "type": "annual_statement",
                    "amount": signed_amount,
                    "taxAmount": 0.0,
                    "date": row_date,
                    "note": line,
                    "isEmployer": None,
                    "confidence": 0.68,
                    "confidenceLabel": "medium",
                    "evidence": [{"page": None, "snippet": line[:180]}],
                    "isDerived": False,
                }
            )

    return {
        "statementPeriodStart": period_start_hint,
        "statementPeriodEnd": period_end_hint,
        "openingBalance": opening_hint,
        "closingBalance": closing_hint,
        "rows": rows,
    }


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    parts: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            parts.append(f"[Page {index}]\n{text.strip()}\n")
    return "\n".join(parts).strip()


def _extract_pdf_text_ocr(pdf_bytes: bytes, languages: list[str]) -> str:
    lang_map = {"en": "eng", "nl": "nld"}
    tesseract_lang = "+".join(lang_map.get(item, "eng") for item in languages)
    images = convert_from_bytes(pdf_bytes, dpi=250, fmt="png")
    parts: list[str] = []
    for index, image in enumerate(images, start=1):
        text = pytesseract.image_to_string(image, lang=tesseract_lang)
        if text.strip():
            parts.append(f"[Page {index}]\n{text.strip()}\n")
    return "\n".join(parts).strip()


def _extract_json_from_text(raw_text: str) -> dict[str, Any]:
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:].strip()
    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model response")
    return json.loads(raw_text[start : end + 1])


def _normalize_rows(payload: dict[str, Any], text_excerpt: str) -> list[ParsedRow]:
    rows_raw = payload.get("rows")
    if not isinstance(rows_raw, list):
        return []

    rows: list[ParsedRow] = []
    for item in rows_raw:
        if not isinstance(item, dict):
            continue
        row_type = str(item.get("type", "")).strip()
        if row_type not in ALLOWED_TYPES:
            continue
        row_date = item.get("date")
        if not _is_iso_date(row_date):
            continue
        amount = _to_float(item.get("amount"))
        tax_amount = _to_float(item.get("taxAmount"))
        confidence = _clamp_confidence(item.get("confidence"))
        evidence = item.get("evidence")
        if not isinstance(evidence, list):
            evidence = [{"page": None, "snippet": text_excerpt}]

        rows.append(
            ParsedRow(
                type=row_type,
                amount=amount,
                tax_amount=tax_amount,
                row_date=str(row_date),
                note=_safe_note(item.get("note")),
                is_employer=item.get("isEmployer")
                if isinstance(item.get("isEmployer"), bool)
                else None,
                confidence=confidence,
                confidence_label=_confidence_label(confidence, item.get("confidenceLabel")),
                evidence=evidence,
                is_derived=bool(item.get("isDerived")),
            )
        )

    return rows


def _derive_annual_statement_row(payload: dict[str, Any], rows: list[ParsedRow]) -> list[ParsedRow]:
    if any(row.type == "annual_statement" for row in rows):
        return rows

    opening = _to_float(payload.get("openingBalance"))
    closing = _to_float(payload.get("closingBalance"))
    if opening == 0 and closing == 0:
        return rows

    contributions = sum(row.amount for row in rows if row.type == "contribution")
    fees = sum(row.amount for row in rows if row.type == "fee")
    annual_value = closing - opening - contributions + fees
    if abs(annual_value) < 1e-9:
        return rows

    period_end = payload.get("statementPeriodEnd")
    if not _is_iso_date(period_end):
        period_end = date.today().isoformat()

    rows.append(
        ParsedRow(
            type="annual_statement",
            amount=annual_value,
            tax_amount=0.0,
            row_date=str(period_end),
            note="Derived annual statement adjustment",
            is_employer=None,
            confidence=0.6,
            confidence_label="low",
            evidence=[{"page": None, "snippet": "Derived from opening/closing balances"}],
            is_derived=True,
        )
    )
    return rows


def _build_extraction_prompt(text: str, provider: str, currency: str, languages: list[str]) -> str:
    return f"""
You extract pension ledger rows from annual statements.
Output JSON only.
Required output schema:
{{
  "statementPeriodStart": "YYYY-MM-DD or null",
  "statementPeriodEnd": "YYYY-MM-DD or null",
  "openingBalance": number or null,
  "closingBalance": number or null,
  "rows": [
    {{
      "type": "contribution|fee|annual_statement",
      "amount": number,
      "taxAmount": number,
      "date": "YYYY-MM-DD",
      "note": "string",
      "isEmployer": true|false|null,
      "confidence": 0..1,
      "confidenceLabel": "high|medium|low",
      "evidence": [{{"page": number|null, "snippet": "short quote"}}]
    }}
  ]
}}
Constraints:
- Provider: {provider}
- Currency: {currency}
- Languages hint: {",".join(languages)}
- Contributions and fees must be positive amounts.
- annual_statement can be positive or negative.
- Use null for unknown fields.
Statement text:
{text}
"""


def _build_messages(prompt: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": "You are a strict JSON extraction engine."},
        {"role": "user", "content": prompt},
    ]


async def _call_vllm(
    text: str, provider: str, currency: str, languages: list[str]
) -> dict[str, Any]:
    base_url = os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    model = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-14B-Instruct-AWQ")
    prompt = _build_extraction_prompt(text, provider, currency, languages)
    timeout_seconds = _read_positive_float_env("VLLM_TIMEOUT_SECONDS", VLLM_TIMEOUT_SECONDS_DEFAULT)

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                f"{base_url}/v1/chat/completions",
                json={
                    "model": model,
                    "temperature": 0,
                    "messages": _build_messages(prompt),
                },
            )
            if response.status_code >= 400:
                raise RuntimeError(
                    f"vLLM returned HTTP {response.status_code}: {response.text[:500]}"
                )
            payload = response.json()
            content = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            return _extract_json_from_text(str(content))
    except Exception as exc:
        raise RuntimeError(
            f"vLLM request failed (base_url={base_url}, model={model}): {exc!r}"
        ) from exc


async def _call_llm(
    text: str,
    provider: str,
    currency: str,
    languages: list[str],
) -> tuple[dict[str, Any], str, str]:
    model = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-14B-Instruct-AWQ")
    logger.info("Using parser LLM backend=vllm, text_chars=%s", len(text))
    payload = await _call_vllm(text=text, provider=provider, currency=currency, languages=languages)
    return payload, model, "vllm"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/extract")
async def extract_statement(
    file: UploadFile = File(...),
    provider: str = Form(default=""),
    currency: str = Form(default=""),
    languageHints: str | None = Form(default=None),
) -> dict[str, Any]:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty")

    languages = _parse_language_hints(languageHints)
    text = _extract_pdf_text(data)
    if len(text.strip()) < MIN_TEXT_LENGTH:
        text = _extract_pdf_text_ocr(data, languages)

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Could not extract text from PDF")

    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]

    period_start_hint, period_end_hint = _extract_period_from_text(text)
    opening_hint = _extract_balance_from_text("opening balance", text)
    closing_hint = _extract_balance_from_text("closing balance", text)
    regex_payload = _build_regex_fallback_payload(
        text=text,
        period_start_hint=period_start_hint,
        period_end_hint=period_end_hint,
        opening_hint=opening_hint,
        closing_hint=closing_hint,
    )
    fallback_used = False
    regex_only = _read_bool_env("PARSER_REGEX_ONLY", False)

    if regex_only:
        payload = regex_payload
        model_name = "regex-fallback"
        model_version = "deterministic-v1"
        fallback_used = True
    else:
        try:
            payload, model_name, model_version = await _call_llm(
                text=text,
                provider=provider,
                currency=currency,
                languages=languages,
            )
        except Exception as exc:
            logger.exception("LLM extraction failed")
            if not _read_bool_env("PARSER_ALLOW_REGEX_FALLBACK", True):
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM extraction failed ({type(exc).__name__}): {exc!r}",
                ) from exc
            payload = regex_payload
            model_name = "regex-fallback"
            model_version = "deterministic-v1"
            fallback_used = True

    if not _is_iso_date(payload.get("statementPeriodStart")) and period_start_hint:
        payload["statementPeriodStart"] = period_start_hint
    if not _is_iso_date(payload.get("statementPeriodEnd")) and period_end_hint:
        payload["statementPeriodEnd"] = period_end_hint
    if payload.get("openingBalance") is None and opening_hint is not None:
        payload["openingBalance"] = opening_hint
    if payload.get("closingBalance") is None and closing_hint is not None:
        payload["closingBalance"] = closing_hint

    text_excerpt = text[:240]
    rows = _normalize_rows(payload, text_excerpt)
    if not rows and regex_payload.get("rows"):
        rows = _normalize_rows(regex_payload, text_excerpt)
        model_name = "regex-fallback"
        model_version = "deterministic-v1"
        fallback_used = True
    rows = _derive_annual_statement_row(payload, rows)

    normalized_rows = [
        {
            "type": row.type,
            "amount": row.amount,
            "taxAmount": row.tax_amount,
            "date": row.row_date,
            "note": row.note,
            "isEmployer": row.is_employer,
            "confidence": row.confidence,
            "confidenceLabel": row.confidence_label,
            "evidence": row.evidence,
            "isDerived": row.is_derived,
        }
        for row in rows
    ]

    return {
        "statementPeriodStart": payload.get("statementPeriodStart")
        if _is_iso_date(payload.get("statementPeriodStart"))
        else None,
        "statementPeriodEnd": payload.get("statementPeriodEnd")
        if _is_iso_date(payload.get("statementPeriodEnd"))
        else None,
        "modelName": model_name,
        "modelVersion": model_version,
        "fallbackUsed": fallback_used,
        "rows": normalized_rows,
    }
