"""One explicit browser-origin policy for CORS, staff login and guest checkout."""
import re
from urllib.parse import urlsplit
from flask import current_app

# Vite may choose a different local port when 5173 is occupied. This exception is
# confined to insecure local development; production uses exact configured origins.
PORT = r'(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])'
LOCAL_ORIGIN = re.compile(r'\Ahttp://(?:localhost|127\.0\.0\.1|\[::1\])(?::' + PORT + r')?\Z')


def development_origins_enabled(config):
    return config.get('APP_ENV', 'development') == 'development' and not config.get('SESSION_COOKIE_SECURE', False)


def configured_origins(config):
    values = config.get('FRONTEND_ORIGINS', '')
    values = values.split(',') if isinstance(values, str) else list(values)
    values = [config['FRONTEND_ORIGIN'], *values]
    result = set()
    for value in values:
        value = value.strip().rstrip('/')
        if not value:
            continue
        parsed = urlsplit(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise ValueError('Frontend origins must be explicit HTTP(S) origins without paths or credentials')
        # Validate the configured port without logging any configuration value.
        parsed.port
        result.add(value)
    return result


def cors_origins(config):
    origins = sorted(configured_origins(config))
    if development_origins_enabled(config):
        origins.append(LOCAL_ORIGIN)
    return origins


def origin_is_allowed(origin, config=None):
    config = current_app.config if config is None else config
    if not isinstance(origin, str) or not origin:
        return False
    origin = origin.rstrip('/')
    if origin in configured_origins(config):
        return True
    if not development_origins_enabled(config) or not LOCAL_ORIGIN.fullmatch(origin):
        return False
    try:
        parsed = urlsplit(origin)
        return parsed.port is None or 0 < parsed.port <= 65535
    except ValueError:
        return False
