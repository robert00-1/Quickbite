QuickBite implementation and verification — 2 November 2026

The existing application, routes, styling and staff workflows were retained. Existing uncommitted/staged work was preserved; no commit, push, merge, database reset or changes to the working SQLite database were performed. All destructive test operations used isolated databases.

| Feature | Status | Files Changed | Test Performed |
|---|---|---|---|
| Menu images | Rendering fixed; source photos incomplete | `frontend/src/services/api.js`, `FoodCard.jsx`, `FoodDetails.jsx`, local SVG fallback | URL normalization, unsafe-scheme rejection, failed-image fallback; Chromium verified loaded fallback images |
| All menu items | Fixed | `services/api.js`, `pages/Menu.jsx` | All returned items render; search/price parameters reach backend; empty/error states tested |
| Dynamic categories | Fixed | `pages/Menu.jsx`, `routes/menu_items.py` | Categories derive from complete API inventory and survive filtering; Kids/daily sections tested |
| M-Pesa | Configuration required; mocked flow tested | `routes/payments.py`, `services/mpesa.py`, `models/payment.py`, `pages/Payment.jsx`, environment examples | Mocked STK request, actual amount, duplicate pending prevention, independent query verification, paid/failed/cancelled states |
| WhatsApp receipts | Configuration required; mocked flow tested | `services/notifications.py`, `models/receipt.py`, `routes/receipts.py` | Mocked provider acceptance/failure, duplicate suppression, signed delivery webhook and challenge verification |
| Staff password visibility | Fixed | `pages/StaffLogin.jsx` | Show/hide tests; real browser login; password hidden by default |
| Multiple waiters | Fixed | `routes/auth.py`, `routes/waiter_profiles.py`, waiter UI | Creating waiter accounts creates/links profiles; selection returns multiple registered waiters, excluding manager accounts |
| Meal of the Day | Fixed | `routes/menu_items.py`, `ManagerOperations.jsx`, `pages/Menu.jsx` | Multiple selections, removal, Kids item selection and retained normal-category rendering |
| Waiter records | Fixed for linked accounts | `services/activity.py`, `routes/waiter.py`, manager/waiter UI | Start/end/idempotent shifts, account ownership, assignments, complete service, measured activity and hours |
| Late orders and complaints | Fixed | `utils/timing.py`, `routes/complaints.py`, `routes/manager.py`, `OrderStatus.jsx`, `ManagerOperations.jsx` | Backend overdue calculation, owner-only complaints, manager list/update, frontend manager sections |
| Authentication/security | Fixed for existing guest/staff flows | `routes/auth.py`, `utils/auth.py`, `utils/customer.py`, `config.py`, order/payment routes | JWT HttpOnly cookies, role checks, CSRF, allowed-origin checks, logout revocation, cookie flags and private-order access |
| Digital receipts | Fixed | `models/receipt.py`, `routes/receipts.py`, receipt/confirmation UI | Unique receipt, unguessable URL, print page, QR payload/PNG, pending-versus-paid state |
| Table numbers and estimates | Fixed | order/menu routes, timing utility, customer/order/receipt UI | A1/B12 accepted; numeric-only/new invalid tables rejected; snapshot estimates remain unchanged after menu edits |
| Meal comparison | Fixed | `pages/Menu.jsx` | Two selections, replacement/removal, names/images/category/prices/preparation times |

Verification results:

- Backend SQLite suite: **29 passed, 0 failed**.
- Backend PostgreSQL 16 suite: **29 passed, 0 failed** in the dedicated `quickbite_test` database.
- Frontend Vitest suite: **23 passed, 0 failed** across two files.
- ESLint: passed.
- Production Vite build: passed. Staff pages are lazy-loaded; the previous oversized initial bundle warning is resolved.
- SQLite and PostgreSQL: full migration upgrade, `flask db check`, new migration downgrade to `a1b2c3d4e5f6`, and re-upgrade passed.
- Copy of the existing unversioned SQLite database: adoption/migration and schema check passed. Counts retained: 5 menu items, 2 staff users, 7 orders, 14 order items, 7 receipts and 0 shifts.
- Live Flask and Vite servers were started separately against `/tmp/quickbite-verification.sqlite`.
- Chromium: menu/daily/Kids rendering, fallback images, search, password toggle, manager redirect/dashboard, mobile cash checkout, printable receipt/QR image, customer order tracking and waiter redirect/order dashboard passed. No JavaScript page errors or console errors were observed.
- Mocked external calls are confined to tests. No real Daraja payment or WhatsApp delivery is claimed.
- Merge-marker scan and whitespace check: passed.

Migration changes:

- New `b2c3d4e5f6a7_secure_orders_and_activity.py`, following the existing receipt/timing migration `a1b2c3d4e5f6`.
- Adds customer ownership and service completion timestamps, staff/profile links, payment attempts, receipt delivery status, complaints and a unique index preventing concurrent active shifts.
- Detects duplicate active shifts before schema changes and rejects them with an actionable error instead of deleting records.
- Links existing profiles only when a staff name identifies exactly one waiter account. Unmatched historical profiles are preserved.
- Repairs known missing legacy shift/receipt foreign keys during adoption.
- Existing uncommitted `a1b2c3d4e5f6` migration was corrected for PostgreSQL table-number conversion. Its downgrade retains string table identifiers to preserve A1/B2 values.
- Historical assignment migration `56083bda4427` now names its foreign key, enabling SQLite upgrades/downgrades.
- `manage_legacy_db.py` validates the known unversioned SQLite baseline before stamping it; `--apply` takes a SQLite backup under `backend/backups/` before upgrading. The original working database was only inspected, not migrated.

Required setup and run commands, from the project root:

```bash
venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# Edit backend/.env with your database, origins, secrets and providers.

# The existing local SQLite database has no Alembic version:
venv/bin/python backend/manage_legacy_db.py
venv/bin/python backend/manage_legacy_db.py --apply

# For an already-versioned database or a new database instead:
cd backend
../venv/bin/flask --app run db upgrade
../venv/bin/flask --app run db check
../venv/bin/python run.py
```

In a second terminal from the project root:

```bash
npm --prefix frontend run dev
```

For production, set `APP_ENV=production`, HTTPS origins and `COOKIE_SECURE=true`; use a WSGI server such as `gunicorn run:app` from `backend`. New staff accounts can be created through the existing manager-authorized API. For an initial manager, after migrations:

```bash
cd backend
../venv/bin/python seed_staff.py manager "Manager Name"
# Password is prompted securely; no known default password is created.
```

Environment variables are fully enumerated in `backend/.env.example` and `frontend/.env.example`:

- App/database: `APP_ENV`, `SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`, `FRONTEND_ORIGIN`, `COOKIE_SECURE`, `FLASK_DEBUG`, `PUBLIC_API_URL`.
- M-Pesa: `MPESA_ENVIRONMENT`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_CALLBACK_SECRET`, `MPESA_TRANSACTION_TYPE`, `MPESA_FORCE_1_KSH`.
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_API_VERSION`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
- Existing image uploads: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Frontend: `VITE_API_BASE_URL`, accepting `/api`, a deployed API root, or the legacy `/api/menu-items` URL. Never put provider credentials in Vite variables.
- Optional initial staff creation: `INITIAL_STAFF_PASSWORD`; otherwise a hidden password prompt is used.

Provider setup and remaining limitations:

1. **Food photos:** every current local menu row has a NULL image. No correct source photographs were available to restore. Upload each actual dish photo through the existing manager image controls after configuring Cloudinary, or save its correct accessible image URL. Missing photos display a neutral local illustration; existing valid URLs are retained.
2. **Kids:** the section appears when actual menu records use the `Kids` category. No fabricated production food records were inserted.
3. **M-Pesa:** obtain your Daraja sandbox/production credentials and shortcode/passkey. Set a publicly reachable HTTPS callback URL and a URL-safe callback secret. The app appends the secret to the callback request URL and redacts it in application access logs; receipt tokens are also redacted. Configure upstream proxy logs to redact that query parameter and receipt URL tokens too. Success requires matching stored amount/phone and a successful independent Daraja status query. KSh 1 mode is explicit and sandbox-only. Verify end-to-end in your own Daraja sandbox before production.
4. **WhatsApp:** configure a legitimate WhatsApp Business sender, token and approved English utility template with an image header and two body parameters: receipt number and receipt URL. The QR image is used as the header. Obtain the customer's WhatsApp opt-in. Configure delivery callbacks at `/api/receipts/whatsapp/webhook` and the app/verification secrets. Provider acceptance is stored as `accepted`, never falsely as delivered; signed callbacks supply delivery/read/failure status.
5. **External delivery failures:** the receipt remains accessible. Failed/unconfigured notifications are recorded and not automatically resent on repeated payment callbacks. Requests interrupted after the atomic delivery claim can remain `sending` and need provider reconciliation before any manual retry.
6. **Guest ordering:** the existing account-free customer flow is preserved, authenticated by a separate signed HttpOnly guest cookie. Customer account registration/password login was not added. Historical orders without an ownership cookie remain accessible to authorized staff and by existing secure receipt links; predictable order IDs cannot recover them.
7. **Legacy staff mapping:** review unmatched profiles rather than guessing account IDs. Historical records without `served_at` have no fabricated serving-time average. Hours use recorded shift timestamps, and display dates use timezone-aware UTC values with local formatting.
8. **Card payments:** the previous browser-only demo could mark orders paid without processing money. Card now means payment at the restaurant; authorized staff confirm actual receipt of Cash/Card money. No online card processor is configured or claimed.
9. **Pending STK requests:** a missing callback leaves a payment pending rather than inventing success. Operator reconciliation with Daraja is required for requests whose outcome remains unknown. Inventory is reserved when the order is placed.
10. Apply migrations to your real database after backup/review. Production cookies and CORS are configured and tested locally; deployment/browser policies must still be verified on your real HTTPS domains. No production deployment was performed.

The independent status query follows the [Safaricom SDK endpoint](https://github.com/safaricom/mpesa-php-sdk/blob/master/src/Mpesa.php); WhatsApp template structure follows [Meta's official Business Platform collection](https://www.postman.com/meta/whatsapp-business-platform/request/n3jhmr4/create-template-w-image-header-text-body-text-footer-and-2-call-to-action-buttons).

Test commands:

```bash
cd backend
../venv/bin/python -m unittest discover -s tests -v
# PostgreSQL alternative: use ONLY a separate database named quickbite_test.
QUICKBITE_TEST_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST/quickbite_test' \
  ../venv/bin/python -m unittest discover -s tests -v

cd ../frontend
npm test
npm run lint
npm run build
```

Temporary test servers and the test database cluster were stopped after verification. The pre-existing frontend process was retained.

The PostgreSQL verification used a temporary cluster on port 55432 with a Unix socket under `/tmp/quickbite-pgsocket`, not the existing PostgreSQL service. UTF-8 client encoding was explicitly configured. Test engines are disposed after each test.

Reproducible browser checks are in `backend/tests/e2e/`. They use explicit test credentials and the fixed `/tmp/quickbite-verification.sqlite` fixture database, never production data. Install `backend/requirements-dev.txt` and `playwright install chromium`. Migrate that temporary database, run `fixture_server.py`, run Vite on port 5174, then run `browser_smoke.py`. Browser screenshots are written under `/tmp/quickbite-*.png`.

Files changed in this task (some already contained user edits):

```text
.github/workflows/backend-ci.yml
.github/workflows/frontend-ci.yml
backend/.env.example
backend/app/__init__.py
backend/app/config.py
backend/app/models/__init__.py
backend/app/models/order.py
backend/app/models/shift.py
backend/app/models/waiter_profile.py
backend/app/models/payment.py
backend/app/models/receipt.py
backend/app/routes/auth.py
backend/app/routes/complaints.py
backend/app/routes/manager.py
backend/app/routes/menu_items.py
backend/app/routes/orders.py
backend/app/routes/payments.py
backend/app/routes/receipts.py
backend/app/routes/waiter.py
backend/app/routes/waiter_profiles.py
backend/app/services/activity.py
backend/app/services/mpesa.py
backend/app/services/notifications.py
backend/app/utils/auth.py
backend/app/utils/customer.py
backend/app/utils/logging.py
backend/app/utils/timing.py
backend/manage_legacy_db.py
backend/migrations/versions/56083bda4427_add_waiter_assignment_to_orders.py
backend/migrations/versions/a1b2c3d4e5f6_add_receipts_and_prep_timing.py
backend/migrations/versions/b2c3d4e5f6a7_secure_orders_and_activity.py
backend/requirements.txt
backend/requirements-dev.txt
backend/run.py
backend/seed_staff.py
backend/tests/test_api.py
backend/tests/test_features.py
backend/tests/e2e/fixture_server.py
backend/tests/e2e/browser_smoke.py
frontend/.env.example
frontend/public/images/meal-unavailable.svg
frontend/src/App.jsx
frontend/src/components/Navbar.jsx
frontend/src/components/ManagerOperations.jsx
frontend/src/components/checkout/DemoPayment.jsx
frontend/src/components/checkout/OrderConfirmation.jsx
frontend/src/components/customer/CustomerForm.jsx
frontend/src/components/menu/FoodCard.jsx
frontend/src/components/waiter/OrderCard.jsx
frontend/src/components/waiter/ReceiptPreview.jsx
frontend/src/components/waiter/WaiterRecord.jsx
frontend/src/components/waiter/WaiterRoster.jsx
frontend/src/features.test.jsx
frontend/src/pages/CustomerDetails.jsx
frontend/src/pages/FoodDetails.jsx
frontend/src/pages/ManagerDashboard.jsx
frontend/src/pages/Menu.jsx
frontend/src/pages/OrderStatus.jsx
frontend/src/pages/Payment.jsx
frontend/src/pages/StaffLogin.jsx
frontend/src/pages/WaiterDashboard.jsx
frontend/src/services/api.js
frontend/src/services/waiterApi.js
frontend/src/utils/orderHelpers.js
requirements.txt
IMPLEMENTATION_REPORT.md
```

Other pre-existing work retained without editing in this task includes `menu_item.py`, `order_item.py`, `complaint.py`, the deletion of `backend/app/services/managerApi.py`, `seed_initial_menu.py`, frontend ESLint/test setup, `App.test.jsx`, `CartContext.jsx`, staged `index.css`, `main.jsx`, `Games.jsx`, `staffApi.js`, Vite configuration, the root package file and the untracked SQLite database.
