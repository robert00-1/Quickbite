"""Anonymous customer authentication via signed HttpOnly JWT cookies."""
import secrets
from flask import request, current_app
from flask_jwt_extended import create_access_token, decode_token
from datetime import timedelta

COOKIE = "quickbite_customer"

def customer_identity():
    try:
        claims = decode_token(request.cookies.get(COOKIE, ""))
        return claims["sub"] if claims.get("role") == "customer" else None
    except Exception:
        return None

def ensure_customer(response):
    identity = customer_identity() or secrets.token_urlsafe(32)
    token = create_access_token(identity=identity, additional_claims={"role": "customer"}, expires_delta=timedelta(days=30))
    response.set_cookie(COOKIE, token, httponly=True, secure=current_app.config["SESSION_COOKIE_SECURE"], samesite=current_app.config["SESSION_COOKIE_SAMESITE"], max_age=2592000)
    return identity

def owns_order(order):
    identity = customer_identity()
    return identity is not None and order.customer_id == identity
