# Daraja and menu pagination

Implemented in the existing React/Flask application. No database schema changes or actual-database migrations were required in this update.

## Payment changes

- `backend/app/config.py`, `services/mpesa.py`: canonical DARAJA environment variables, compatible legacy MPESA aliases, official OAuth and STK endpoints, Nairobi timestamp/password generation, strict Kenyan phone and whole-shilling amount validation. Provider error bodies and credentials are not returned to customers.
- `backend/app/routes/payments.py`, `app/__init__.py`: `/api/mpesa/stk-push` and `/api/mpesa/callback`, retaining `/api/payments` aliases. An attempt is reserved before the external request. Pending/uncertain requests block duplicate prompts. Definitively rejected requests may retry the same order. Payment remains pending until validated callback metadata and an independent Daraja status query confirm success. Duplicate callbacks do not create another receipt. Cancelled and failed callbacks retain distinct states.
- `frontend/src/pages/Payment.jsx`: M-Pesa payer number input, validation, pending/status checks and cancellation messages. Cash and Card remain payment at the restaurant. Guest ordering, server-calculated totals, ownership checks and cart retention remain intact.

A network timeout can mean Daraja accepted a request without returning its ID. Such attempts stay `Unknown` and require staff/provider reconciliation before another payment. Automatic retries would risk charging twice. There is no new reconciliation dashboard in this change.

## Configure the backend

Set these in backend `.env`, using values from your Daraja application (never Vite/frontend variables):

```dotenv
DARAJA_ENV=sandbox
DARAJA_CONSUMER_KEY=
DARAJA_CONSUMER_SECRET=
DARAJA_SHORTCODE=
DARAJA_PASSKEY=
DARAJA_CALLBACK_URL=https://YOUR-PUBLIC-HOST/api/mpesa/callback
DARAJA_CALLBACK_SECRET=
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
MPESA_FORCE_1_KSH=false
```

Generate a long random callback secret, for example `openssl rand -hex 32`. The service adds it to the callback URL query string. Keep it private and redact query strings in reverse-proxy access logs. Safaricom STK callbacks do not provide an application HMAC signature; this implementation checks the secret, recorded amount/phone/receipt and independently queries Daraja before accepting success.

Create/select an application with Lipa Na M-Pesa Online access in the [official Daraja portal](https://developer.safaricom.co.ke/). Use matching sandbox key, secret, test shortcode and passkey. Expose the backend through a public HTTPS host or tunnel, forward POST requests to the callback route, and restart Flask after configuring environment variables. A localhost callback cannot work. STK requests supply their callback URL directly. Keep production credentials and production environment separate.

Credentials/public callback were absent here: no real STK prompt, PIN entry, charge or Safaricom delivery was verified. Mocked provider tests verify application behavior. With configured sandbox access, submit an order, confirm it remains Pending after STK acceptance, approve the prompt on a supported test phone, then check callback/status verification and one Paid receipt. Also check cancellation, wrong PIN, pending and repeated callbacks. Never manually set a payment to Paid to bypass verification.

## Pagination and manager section clarification

- `frontend/src/components/Pagination.jsx`, `hooks/usePagination.js`: shared ten-item pagination; previous/next, numbered pages, current-page red styling, result counts, responsive wrapping and accessible labels.
- `hooks/useMealPagination.js`, `components/MealListFilters.jsx`: manager search/category filters and page resets.
- `pages/Menu.jsx`: customer Meals Available list paginated; search/category/price changes reset the page. Featured Meal of the Day remains a separate existing section.
- `pages/ManagerDashboard.jsx`: Meals Available table paginated; uploads and availability actions preserved.
- `components/ManagerOperations.jsx`: the clarified Service and meal management section (Meal of the Day selections and preparation/serving estimates) paginated separately. There is no standalone Services model; none was invented.
- `backend/app/utils/pagination.py`, `routes/menu_items.py`, `frontend/src/services/api.js`: optional `?page=1&per_page=10` response with items and pagination metadata; existing full-array callers remain compatible. All MealDB meals remain reachable through pagination.

Existing styling and architecture retained; no new dependencies. No actual database records were changed by this update's tests.

## Verification

- Backend: `cd backend && ../venv/bin/python -m pytest tests -q` (isolated test database).
- Frontend: `cd frontend && npm test && npm run lint && npm run build`.
- Regression files: `backend/tests/test_daraja_pagination.py`, `frontend/src/pagination.test.jsx`, updated `frontend/src/features.test.jsx`.

Final executed results are recorded below after the checks finish.

Executed results:

- `cd backend && ../venv/bin/python -m pytest tests -q`: **53 passed**.
- `cd frontend && npm test`: **33 passed** across 3 files.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed.
- `git diff --check`: passed.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/quickbite-browsers venv/bin/python /tmp/quickbite-browser-smoke.py`: passed. This is the existing `backend/tests/e2e/browser_smoke.py` with frontend port changed from occupied 5174 to dedicated 5176. Checks images, mobile Cash/Card checkout, receipt/QR, order tracking, missing-config M-Pesa retry/cart retention, manager/waiter authentication and dashboards; zero page errors.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/quickbite-browsers venv/bin/python /tmp/quickbite-pagination-browser.py`: passed. Also saved as `backend/tests/e2e/pagination_smoke.py`. Uses 23 mocked menu records and real isolated staff authentication: customer mobile and both manager lists navigate to the three-record final page correctly; no mobile customer overflow.

The browser fixture used only `/tmp/quickbite-verification.sqlite` on backend port 5500 and a dedicated Vite server on 5176. Its previously missing existing MealDB migration was applied to this temporary database only before the successful rerun. Earlier attempts failed because port 5174 was occupied and the temporary fixture schema was behind; neither was treated as a passing check. Actual restaurant database was not migrated or changed in this update.
