import re

PII_PATTERNS = [
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "[EMAIL]"),
    (r"\b(\+91|0)?[6-9]\d{9}\b", "[PHONE]"),
    (r"\b\d{4}\s?\d{4}\s?\d{4}\b", "[AADHAAR]"),
    (r"\b(?:\d{4}[-\s]?){3}\d{4}\b", "[CARD]"),
]


def redact_pii(text: str) -> str:
    for pattern, replacement in PII_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text
