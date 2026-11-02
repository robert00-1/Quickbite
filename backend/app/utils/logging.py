"""Redact callback credentials from HTTP access logs."""
import logging
import re

class RedactCallbackSecret(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        message = re.sub(r"(/api/receipts/)[A-Za-z0-9_-]{40,}", r"\1[REDACTED]", message)
        record.msg = re.sub(r'([?&](?:secret|hub\.verify_token)=)[^&\s\"]+', r'\1[REDACTED]', message)
        record.args = ()
        return True
