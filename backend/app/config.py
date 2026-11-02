
import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Load backend/.env if it exists, otherwise root .env
if (BASE_DIR / ".env").exists():
    load_dotenv(BASE_DIR / ".env")
else:
    load_dotenv()


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{BASE_DIR / 'quickbite.db'}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Staff authentication cookies
    STAFF_SESSION_COOKIE = "quickbite_staff_session"
    STAFF_CSRF_COOKIE = "quickbite_staff_csrf"
    STAFF_SESSION_HOURS = 8

    # Secure cookies are enabled in production by default.
    SESSION_COOKIE_SECURE = (
        os.getenv("COOKIE_SECURE", "true" if os.getenv("APP_ENV") == "production" else "false").lower() == "true"
    )
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "None" if SESSION_COOKIE_SECURE else "Lax"
    SESSION_COOKIE_PATH = "/"

    FRONTEND_ORIGIN = os.getenv(
        "FRONTEND_ORIGIN",
        "https://frontend-three-phi-81.vercel.app",
    )

    MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY")
    MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET")
    MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE")
    MPESA_PASSKEY = os.getenv("MPESA_PASSKEY")
    MPESA_CALLBACK_URL = os.getenv("MPESA_CALLBACK_URL")
    MPESA_ENVIRONMENT = os.getenv("MPESA_ENVIRONMENT", "sandbox")
    MPESA_FORCE_1_KSH = os.getenv("MPESA_FORCE_1_KSH", "false")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_ACCESS_COOKIE_NAME = STAFF_SESSION_COOKIE
    JWT_COOKIE_CSRF_PROTECT = False  # Session-bound CSRF is checked by staff_required.
    JWT_COOKIE_SECURE = SESSION_COOKIE_SECURE
    JWT_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE
    MPESA_CALLBACK_SECRET = os.getenv("MPESA_CALLBACK_SECRET")
    MPESA_TRANSACTION_TYPE = os.getenv("MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline")
    PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://localhost:5000")
    WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
    WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET")
    WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
    WHATSAPP_TEMPLATE_NAME = os.getenv("WHATSAPP_TEMPLATE_NAME")
    WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v23.0")

    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
