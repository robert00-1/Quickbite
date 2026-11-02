# QuickBite remaining-issues implementation report

> Approved local database update: after explicit user approval, the actual `backend/quickbite.db` was backed up, integrity-checked and migrated to `d4e5f6a7b8c9`. Every pre-existing row value, including staff password hashes, was verified unchanged; foreign-key violations: zero. The origin policy is now shared by CORS, checkout and staff login and accepts alternate loopback ports only in development. Current backend tests: 49 passed. The identified local Flask development server was restarted on port 5000; live preflight and guest-session requests succeeded from localhost ports 5173/5174 and 127.0.0.1:5175, while an untrusted origin returned 403. No test orders were inserted into the actual database. Historical statements below saying the database was not migrated describe the earlier task, not the current state.

> Menu update: the customer menu now uses the original full MealDB catalogue. See [MENU_SETUP.md](MENU_SETUP.md) for the current source, restart instructions and recipe-link migration. The menu-specific update supersedes the earlier five-photo-only catalogue notes below.

## 1. Issues identified

The payment failure was reproduced for **Cash, Card and M-Pesa** using a SQLite backup under `/tmp`, without writing to the configured database.

The configured database is `backend/quickbite.db`, an **unversioned SQLite database**. It has historical orders, items, receipts, menu records, staff accounts and sessions, but lacks the model’s `orders.customer_id` and `orders.served_at` columns and the previously prepared payment/complaint/notification schema. Consequently, inserting any new order failed. The broad exception handler returned only `Could not create the order`.

There were additional issues:

- Receipt notification delivery ran inside the order route’s success/error block after commit. A notification exception could make a saved order appear to have failed.
- The payment screen had no durable request key and the Cash/Card button stayed clickable while submitting. A retry after a lost response could create another order.
- Card-at-restaurant orders did not receive an initial pending-payment receipt.
- All five current menu records have NULL image values. Manager images also needed the shared URL normalization.
- WhatsApp supported receipt delivery but not all five order lifecycle events. Its webhook verification token could appear in access logs.
- The unittest suite could not be collected by pytest because of a test import. Alembic used a deprecated engine accessor.

**The actual database remains unchanged. Its migration is still required before its order flow can work.** The application now reports `503 / database_migration_required` rather than concealing the missing schema or attempting an automatic migration.

## 2. Files changed

| Files | Purpose |
|---|---|
| `backend/app/__init__.py`, `utils/schema.py` | Read-only ordering schema check, structured unavailable response, idempotency CORS header; production JWT secret validation |
| `backend/app/models/order.py`, `models/notification.py`, `models/__init__.py` | Request-key/fingerprint fields and durable unique order-event records |
| `backend/app/routes/orders.py` | Guest-session bootstrap, retry deduplication, server totals/validation, atomic order writes, pending Cash/Card receipts, optional delivery after commit |
| `backend/app/routes/payments.py`, `routes/waiter.py` | Payment-confirmed/preparing/ready/completed notification hooks; meaningful missing-Daraja configuration response |
| `backend/app/services/notifications.py` | One-time event claims, approved template requests, failure isolation, malformed-provider-response handling |
| `backend/app/routes/receipts.py`, `utils/logging.py` | Signed delivery status updates for events and receipts, malformed-signature rejection, verification-token redaction |
| `backend/app/routes/menu_items.py`, `services/menu_images.py` | Curated photo resolution, safe photo serving, public attribution page |
| `backend/app/static/menu/catalog.json`, `README.md`, five JPEG files | Dish-matched bundled photographs and source/license attribution |
| `backend/migrations/versions/c3d4e5f6a7b8_order_retries_and_notifications.py` | New additive migration, following `b2c3d4e5f6a7` |
| `backend/manage_legacy_db.py`, `migrations/env.py` | Verified backup-only mode, exclusive timestamped backups, integrity checking, current engine API |
| `backend/.env.example`, `requirements-dev.txt`, `.github/workflows/backend-ci.yml` | Event template configuration, pytest test dependency and CI checks |
| `backend/tests/test_api.py`, `test_features.py`, `test_migrations.py` | Regression coverage, isolated provider configuration and pytest collection |
| `backend/tests/e2e/fixture_server.py`, `browser_smoke.py` | Separate test backend, photographs, mobile Cash/Card and M-Pesa retry checks |
| `frontend/src/pages/Payment.jsx` | Shared order submission, guest cookies, durable retry key, duplicate-click guard, meaningful errors, safe cart/redirect behavior |
| `frontend/src/components/checkout/DemoPayment.jsx`, `PaymentMethod.jsx` | Physical restaurant-payment labels, submission disabling, mobile label sizing; no online cash/card simulation |
| `frontend/src/services/api.js`, `services/managerApi.js` | Robust image normalization, invalid/credential URL rejection and manager image paths |
| `frontend/src/pages/Menu.jsx` | Photo credit link, retaining the existing menu layout |
| `frontend/src/features.test.jsx`, `frontend/vite.config.js` | Retry/image tests and optional test-only development proxy target |
| `IMPLEMENTATION_REPORT.md` | This report replaces the previous report with current findings and results |

The five JPEG files are `chicken-burger.jpg`, `beef-pilau.jpg`, `grilled-chicken-and-chips.jpg`, `vegetable-samosas.jpg` and `passion-juice.jpg` under `backend/app/static/menu/`.

## 3. Order creation

Verified against migrated isolated databases:

- **Cash:** creates a persisted guest order and receipt with `Pending` payment. The screen states that payment is made at the restaurant.
- **Card at restaurant:** creates a persisted guest order and receipt with `Pending` payment. It does not process an online card charge. Authorized staff can confirm payment received.
- **M-Pesa:** first creates a Pending order, then requests Daraja STK Push. Existing amount/phone validation, independent success query and duplicate callback protections remain. Missing credentials produce a clear configuration error while retaining the cart and saved order. A retry reuses the existing order.
- Prices and totals come from the database, not submitted frontend prices. IDs, quantities, availability, stock, customer fields and table numbers are validated.
- Guest checkout remains account-free. The guest cookie establishes ownership before order submission. A stored request key is scoped to the same owner and exact normalized request; conflicting reuse returns 409.
- The cart clears only after a successful Cash/Card order or confirmed M-Pesa payment. Failed creation never redirects to confirmation. Notifications cannot undo a committed order.

The running application’s actual database still needs the explicit migration steps below. No request creates tables, adds columns or stamps a migration automatically.

## 4. Food images

Five actual photographs, matched to the existing dish names, are bundled and served at `/api/menu-items/photos/<filename>`. This avoids external hotlink failures and does not update menu rows. Existing manager-uploaded URLs take priority; unrecognized dishes continue to use the existing neutral fallback.

Verified JPEG responses and real browser image decoding. Customer menu, daily-meal cards and details use the shared paths. The manager menu now normalizes those paths too. The waiter dashboard has no food-image component, so its layout was preserved.

These are **representative photographs of the dishes**, not photographs of QuickBite’s own plating. Sources, photographers and CC BY-SA/CC0 licenses are in [the bundled image credits](backend/app/static/menu/README.md) and the public `/api/menu-items/photo-credits` page, linked from the menu. For example, the beef image is explicitly documented as [Kenyan pilau rice and beef](https://commons.wikimedia.org/wiki/File:Pilau_Rice_(Mixed_Spiced_Rice)_&_Beef.jpg).

Cloudinary remains available for your own photographs. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`; no Cloudinary upload was attempted or claimed. Bundled photos require no hosting credentials.

## 5. WhatsApp

The official Business Cloud API integration now supports these unique order events:

| Trigger | Event |
|---|---|
| Order committed | `order_received` |
| Staff confirms Cash/Card or Daraja verifies success | `payment_confirmed` |
| Waiter advances to Preparing | `preparing` |
| Waiter advances to Ready | `ready` |
| Waiter advances to Served | `completed` |

Each event is persisted once per order and claimed atomically before sending. Repeated confirmations/updates do not send it again. Receipt messages retain their separate one-time delivery claim and QR/link template. Network errors, unexpected responses and notification database errors are isolated from committed ordering/payment operations.

Provider acceptance is stored as `accepted`, not falsely as delivered. Signed webhooks update sent, delivered, read and failed status for both receipt and event records. Duplicate/older statuses do not undo delivered/read states. Failures are recorded; no automatic resend occurs during subsequent order updates.

Verification endpoint: `GET /api/receipts/whatsapp/webhook`.
Delivery endpoint: `POST /api/receipts/whatsapp/webhook` with HMAC-SHA256 `X-Hub-Signature-256`.

**No real WhatsApp message was sent.** Credentials and approved templates are absent. Mocked send, duplicate, exception, signature and delivery-state tests passed. The integration follows [Meta’s official webhook guidance](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/receivingMessages/) and its [Business Platform API collection](https://www.postman.com/meta/whatsapp-business-platform/overview).

A process interrupted after sending but before recording provider acceptance can leave a `sending` record. Reconcile it with the provider before manually retrying; blind retries could send a duplicate.

## 6. Database and backup procedure

The actual database was inspected in SQLite read-only mode. All migration applications, rollback tests, fixture writes and order submissions used databases under `/tmp` or the dedicated temporary PostgreSQL cluster on port 55432.

A fresh copy of the actual database was validated, backed up, adopted and migrated. **Every original row and every original column value matched afterward**, not just row counts:

| Table | Preserved rows |
|---|---:|
| menu_items | 5 |
| staff_users | 2 |
| waiter_profiles | 1 |
| shifts | 0 |
| orders | 7 |
| staff_sessions | 2 |
| weekly_shifts | 0 |
| order_items | 14 |
| receipts | 7 |

New migration: `c3d4e5f6a7b8`, parent `b2c3d4e5f6a7`. It adds nullable retry metadata and the notification table with unique order/event and provider-ID constraints. It does not remove existing records. Upgrade/schema parity and downgrade/re-upgrade passed on isolated SQLite/PostgreSQL databases. A downgrade removes new notification data, so do not run it on your actual database merely for testing.

**Manual commands for the currently configured unversioned SQLite database, from the project root:**

1. Stop your actual Flask service so no orders change during backup/migration.
2. Validate the supported historical schema and create a verified backup:

   ```bash
   venv/bin/python backend/manage_legacy_db.py
   venv/bin/python backend/manage_legacy_db.py --backup-only
   ```

   The second command uses SQLite’s backup API, runs `PRAGMA integrity_check`, prints the unique backup path under `backend/backups/`, and changes no source records or schema. Keep a separate copy of that backup and verify the printed integrity success before proceeding.

3. Only when you are ready to authorize and apply the database update:

   ```bash
   venv/bin/python backend/manage_legacy_db.py --apply
   cd backend
   ../venv/bin/flask --app run db check
   ../venv/bin/python run.py
   ```

   `--apply` takes another verified backup before stamping the validated historical baseline and upgrading. Unsupported schemas are rejected. Do not blindly stamp/reset the database.

4. In a second terminal, from the project root:

   ```bash
   npm run dev
   ```

For an **already-versioned** database, use `flask --app run db upgrade` from `backend` only after a verified backup. For PostgreSQL, take a `pg_dump --format=custom` backup and verify it in a separate restore database before upgrading. Do not use the legacy SQLite adoption tool on PostgreSQL.

## 7. Security

- Guest ownership, JWT HttpOnly cookies, staff role checks and CSRF remain enforced.
- Cookie sessions are not replaced by frontend authentication tokens.
- Cross-origin checkout allows the `Idempotency-Key` header only under existing configured origins.
- Retry keys cannot reveal another guest’s order or silently change an existing order’s contents.
- Secure database prices, merged duplicate item lines and stock validation remain authoritative.
- Production now also rejects JWT signing secrets shorter than 32 characters.
- Receipt URLs remain random; receipt tokens and callback/webhook verification secrets are redacted in application access logs. Configure the same redaction in upstream proxy logs.
- WhatsApp signatures must have the correct hexadecimal format before constant-time validation; malformed/non-ASCII signatures return 403.
- Image URL handling rejects unsafe schemes, invalid URLs and embedded credentials. Cloudinary credentials stay backend-only.
- The remaining secret/database setup is explicit; no security check was bypassed to make an outdated schema work.

## 8. Tests: commands and actual results

Run from `backend` unless stated otherwise:

```bash
../venv/bin/python -m pytest tests -q
```

**SQLite: 37 passed, 0 failed, no warnings.** Includes a disposable migration regression database.

```bash
QUICKBITE_TEST_DATABASE_URL='postgresql+psycopg://surleen@/quickbite_test?host=/tmp/quickbite-pgsocket&port=55432&client_encoding=utf8' \
  ../venv/bin/python -m pytest tests -q
```

**PostgreSQL: 37 passed, 0 failed, no warnings.** API tests use only `quickbite_test`; the migration regression separately uses disposable SQLite. The temporary cluster did not use your actual PostgreSQL service.

For isolated PostgreSQL migration verification, `DATABASE_URL` was set to:

```text
postgresql+psycopg://surleen@/quickbite_migration_test?host=/tmp/quickbite-pgsocket&port=55432&client_encoding=utf8
```

The following commands were executed there and passed:

```bash
../venv/bin/flask --app run db upgrade
../venv/bin/flask --app run db check
../venv/bin/flask --app run db downgrade b2c3d4e5f6a7
../venv/bin/flask --app run db upgrade
```

The migrated actual-database **copy** also passed `db check`. Backup-only/adoption commands were tested against `/tmp/quickbite-remaining-verified-copy.sqlite`; actual records were compared read-only afterward.

From the project root:

```bash
npm test
npm run lint
npm run build
```

**Frontend: 25 passed, 0 failed; ESLint passed; production build passed without warnings.**

Live application commands used:

```bash
# Migrate only the disposable browser fixture database first:
cd backend
DATABASE_URL=sqlite:////tmp/quickbite-verification.sqlite ../venv/bin/flask --app run db upgrade
cd ..
venv/bin/python backend/tests/e2e/fixture_server.py
# Separate terminal:
cd frontend
QUICKBITE_PROXY_TARGET=http://127.0.0.1:5500 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
# Separate terminal, project root:
PLAYWRIGHT_BROWSERS_PATH=/tmp/quickbite-browsers venv/bin/python backend/tests/e2e/browser_smoke.py
```

**Chromium passed:** menu/search, bundled photo decoding and fallback images, password toggle, manager login/dashboard, mobile Cash checkout, Card-at-restaurant checkout, receipt/QR display, order tracking, waiter login/dashboard, M-Pesa missing-credential handling, preserved cart and retry without duplicate order creation. No unhandled JavaScript page errors; the expected 503 configuration response is exercised deliberately. Responsive payment labels and page width were checked at 390px.

`git diff --check` passed. The pytest import and Alembic/JWT test warnings encountered during investigation were corrected rather than suppressed. No real payment/message delivery was claimed from mocked tests.

## 9. Manual configuration

Use `backend/.env.example`; no credentials were invented or written into your actual `.env`.

**Application:**

```text
DATABASE_URL
SECRET_KEY                  # random, at least 32 characters
JWT_SECRET_KEY              # distinct random value, at least 32 characters
APP_ENV                     # production for deployment
COOKIE_SECURE               # true on HTTPS deployment
FRONTEND_ORIGIN             # exact frontend origin
PUBLIC_API_URL              # public HTTPS backend origin for receipt/QR URLs
FLASK_DEBUG                 # false in deployment
```

**Daraja:**

```text
MPESA_ENVIRONMENT           # sandbox initially; production only with production credentials
MPESA_CONSUMER_KEY
MPESA_CONSUMER_SECRET
MPESA_SHORTCODE
MPESA_PASSKEY
MPESA_CALLBACK_URL          # public HTTPS /api/payments/callback
MPESA_CALLBACK_SECRET       # long URL-safe random value
MPESA_TRANSACTION_TYPE      # normally CustomerPayBillOnline
MPESA_FORCE_1_KSH           # false normally; explicit sandbox-only testing option
```

Create/select your Daraja app and provide credentials/shortcode/passkey for its environment. Make the callback publicly reachable and verify real sandbox STK confirmation before production. KSh 1 mode is rejected in production.

**Meta WhatsApp:**

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID  # optional setup/WABA identifier, not required for sending
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
WHATSAPP_API_VERSION          # supported Graph API version
WHATSAPP_TEMPLATE_NAME        # existing approved receipt template
WHATSAPP_ORDER_TEMPLATE_NAME  # approved order-event template
WHATSAPP_TEMPLATE_LANGUAGE    # language code matching approval, default en
```

In Meta’s WhatsApp Manager:

- Register/configure the business phone and appropriate API token/permissions. Obtain customer opt-in for notifications.
- Approve a receipt utility template with an **IMAGE header** and two BODY parameters: receipt number and receipt URL. The header receives the QR PNG URL.
- Approve an order-event utility template with two BODY parameters: order ID and event description. Suggested text: `QuickBite order {{1}}: {{2}}.` Use examples representing the actual event labels.
- Configure callback URL `https://YOUR_BACKEND/api/receipts/whatsapp/webhook` and the matching verification token. Subscribe to the WhatsApp **messages** webhook field and connect the app to the WABA.
- Set the Meta app secret used to validate delivery signatures. Confirm sent/delivered/read/failed events against your real sender; API acceptance alone is not delivery.

**Optional Cloudinary uploads:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

**Frontend:** `VITE_API_BASE_URL=/api` for the usual proxy, or the deployed backend API root. Backend secrets never belong in Vite variables. `QUICKBITE_PROXY_TARGET` is an optional development-server override used to isolate browser tests; the normal target remains port 5000.

For tests, install `venv/bin/pip install -r backend/requirements-dev.txt`. Playwright browser assets are needed only for the live browser script.

## 10. Remaining work

1. **You must explicitly apply the verified database migration.** Per your instruction, no migration was applied to the actual database. Until then, its order API correctly reports the pending database update.
2. Configure and test your actual Daraja sandbox credentials/public callback. No real STK payment was made.
3. Configure Meta credentials, approved templates, WABA subscription and a public receipt/webhook origin; verify actual delivery with opted-in recipients. No real WhatsApp message was sent.
4. Replace bundled representative food photos with your own Cloudinary uploads if desired. Existing five menu items already have suitable bundled images through API resolution.
5. Customer registration remains a future enhancement; guest checkout is intentionally retained. Production deployment and real-origin cookie/browser verification remain manual.
6. An externally accepted STK request whose response/callback is lost still needs provider reconciliation; the app never invents payment success. Likewise, reconcile interrupted `sending` notifications before retrying them.

No commit or push was performed. The existing backend on port 5000 was not stopped or replaced. Temporary test services are stopped after verification.
