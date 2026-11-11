"""Structured logging setup (never log API keys)."""
import logging
import os
import re
import sys

# Redact potential API keys and tokens in log messages
API_KEY_PATTERN = re.compile(r"(AIza[0-9A-Za-z-_]{35}|Bearer\s+[A-Za-z0-9\-_\.]+|key=[A-Za-z0-9-_]+)", re.IGNORECASE)


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        orig = super().format(record)
        return API_KEY_PATTERN.sub("[REDACTED_SECRET]", orig)


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("story_wave")
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = RedactingFormatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(filename)s:%(lineno)d - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


logger = setup_logging()
