

### Checkout or staff login says “Request origin is not allowed”

CORS, guest checkout and staff login share the policy in `app/utils/origins.py`.
Development (`APP_ENV=development`, `COOKIE_SECURE=false`) accepts HTTP loopback
origins on Vite's alternate ports, including localhost, 127.0.0.1 and IPv6 loopback.
Production accepts only `FRONTEND_ORIGIN` plus optional comma-separated exact
`FRONTEND_ORIGINS`. LAN addresses/custom domains must be explicitly configured.
Restart Flask after changing origin configuration or backend code. CSRF and staff
role checks remain enabled.
