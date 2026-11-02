"""Safaricom Daraja configuration, OAuth and STK request validation."""
import base64
import ipaddress
import re
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from zoneinfo import ZoneInfo
import requests
from requests.auth import HTTPBasicAuth
from flask import current_app


class DarajaError(ValueError):
    def __init__(self, message, code='daraja_invalid_configuration', status=400):
        super().__init__(message)
        self.code = code
        self.status = status


def setting(name, legacy, default=None):
    return current_app.config.get(name) or current_app.config.get(legacy) or default


def configuration():
    env = str(setting('DARAJA_ENV', 'MPESA_ENVIRONMENT', 'sandbox')).lower()
    if env not in ('sandbox', 'production'):
        raise DarajaError('DARAJA_ENV must be sandbox or production.')
    return {
        'environment': env,
        'domain': 'https://api.safaricom.co.ke' if env == 'production' else 'https://sandbox.safaricom.co.ke',
        'key': setting('DARAJA_CONSUMER_KEY', 'MPESA_CONSUMER_KEY'),
        'secret': setting('DARAJA_CONSUMER_SECRET', 'MPESA_CONSUMER_SECRET'),
        'shortcode': setting('DARAJA_SHORTCODE', 'MPESA_SHORTCODE'),
        'passkey': setting('DARAJA_PASSKEY', 'MPESA_PASSKEY'),
        'callback': setting('DARAJA_CALLBACK_URL', 'MPESA_CALLBACK_URL'),
        'callback_secret': setting('DARAJA_CALLBACK_SECRET', 'MPESA_CALLBACK_SECRET'),
    }


def normalize_phone(phone):
    compact = re.sub(r'[ ()-]', '', str(phone).strip())
    if not re.fullmatch(r'\+?(?:254[17][0-9]{8}|0[17][0-9]{8}|[17][0-9]{8})', compact):
        raise DarajaError('Enter a valid Kenyan M-Pesa number, such as 0712345678 or 0112345678.', 'invalid_phone')
    compact = compact.lstrip('+')
    if compact.startswith('0'):
        return '254' + compact[1:]
    return '254' + compact if len(compact) == 9 else compact


def payment_amount(total):
    try:
        amount = Decimal(str(total))
        if not amount.is_finite() or amount <= 0 or amount > Decimal('99999999'):
            raise ValueError()
        if str(current_app.config.get('MPESA_FORCE_1_KSH', 'false')).lower() == 'true':
            if configuration()['environment'] == 'production':
                raise DarajaError('KSh 1 testing is only permitted in sandbox.')
            return 1
        if amount != amount.to_integral_value():
            raise DarajaError('M-Pesa requires a whole-shilling order total. Please use Cash or Card at the restaurant.', 'invalid_amount')
        return int(amount)
    except (InvalidOperation, TypeError, ValueError) as exc:
        if isinstance(exc, DarajaError):
            raise
        raise DarajaError('Order amount must be a positive whole-shilling value.', 'invalid_amount') from None


def password_fields(config=None):
    config = config or configuration()
    timestamp = datetime.now(ZoneInfo('Africa/Nairobi')).strftime('%Y%m%d%H%M%S')
    password = base64.b64encode(f"{config['shortcode']}{config['passkey']}{timestamp}".encode()).decode()
    return timestamp, password


def callback_url(config):
    value = config['callback']
    try:
        parsed = urlsplit(value or '')
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
            raise ValueError()
        host = parsed.hostname.lower()
        if host == 'localhost' or host.endswith(('.localhost', '.local')):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError()
        parsed.port
    except ValueError:
        raise DarajaError('DARAJA_CALLBACK_URL must be a publicly reachable HTTPS URL.') from None
    if not config['callback_secret']:
        raise DarajaError('Restaurant staff must set DARAJA_CALLBACK_SECRET to protect payment callbacks.', 'mpesa_not_configured', 503)
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params['secret'] = config['callback_secret']
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(params), ''))


def stk_payload(order, phone):
    config = configuration()
    if not all(config[name] for name in ('key', 'secret', 'shortcode', 'passkey', 'callback', 'callback_secret')):
        raise DarajaError('M-Pesa is not configured. Restaurant staff must configure the Daraja credentials and public callback URL.', 'mpesa_not_configured', 503)
    if not str(config['shortcode']).isdigit():
        raise DarajaError('Restaurant staff must configure a valid Daraja shortcode.')
    timestamp, password = password_fields(config)
    return {
        'BusinessShortCode': config['shortcode'], 'Password': password, 'Timestamp': timestamp,
        'TransactionType': current_app.config.get('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
        'Amount': payment_amount(order.total), 'PartyA': normalize_phone(phone), 'PartyB': config['shortcode'],
        'PhoneNumber': normalize_phone(phone), 'CallBackURL': callback_url(config),
        'AccountReference': f'QB{order.id}'[:12], 'TransactionDesc': f'Order {order.id}'[:13],
    }


def get_access_token():
    config = configuration()
    if not config['key'] or not config['secret']:
        raise DarajaError('Daraja credentials are missing.', 'mpesa_not_configured', 503)
    fingerprint = (config['key'], config['secret'], config['environment'])
    cache = current_app.extensions.get('mpesa_token')
    if cache and cache[0] == fingerprint and time.time() < cache[2]:
        return cache[1]
    try:
        response = requests.get(config['domain'] + '/oauth/v1/generate?grant_type=client_credentials', auth=HTTPBasicAuth(config['key'], config['secret']), timeout=20)
        response.raise_for_status()
        data = response.json()
        token = data.get('access_token')
        if not isinstance(token, str) or not token:
            raise ValueError()
        expires = max(0, int(data.get('expires_in', 3599)) - 60)
    except (requests.RequestException, ValueError, TypeError, AttributeError):
        raise DarajaError('Daraja authentication failed. Restaurant staff must check credentials or retry later.', 'daraja_authentication_failed', 502) from None
    current_app.extensions['mpesa_token'] = (fingerprint, token, time.time() + expires)
    return token
