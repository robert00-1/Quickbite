import time
import requests
from requests.auth import HTTPBasicAuth
from flask import current_app


def get_access_token():
    key = current_app.config.get("MPESA_CONSUMER_KEY")
    secret = current_app.config.get("MPESA_CONSUMER_SECRET")
    env = current_app.config.get("MPESA_ENVIRONMENT", "sandbox")
    if not key or not secret:
        raise ValueError("Daraja credentials are missing")
    cache = current_app.extensions.get("mpesa_token")
    fingerprint = (key, secret, env)
    if cache and cache[0] == fingerprint and time.time() < cache[2]:
        return cache[1]
    domain = "https://api.safaricom.co.ke" if env == "production" else "https://sandbox.safaricom.co.ke"
    response = requests.get(domain + "/oauth/v1/generate?grant_type=client_credentials", auth=HTTPBasicAuth(key, secret), timeout=20)
    response.raise_for_status()
    data = response.json()
    if not data.get("access_token"):
        raise ValueError("Daraja did not return an access token")
    current_app.extensions["mpesa_token"] = (fingerprint, data["access_token"], time.time() + max(0, int(data.get("expires_in", 3599)) - 60))
    return data["access_token"]
