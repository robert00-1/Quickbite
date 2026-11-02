# Original MealDB menu

> Update: the user subsequently approved the local database migration. It has been applied and verified through `d4e5f6a7b8c9`; do not rerun the unversioned adoption commands below on that now-versioned database.

The menu now uses **TheMealDB**, as requested. The live verification returned **793 meals across all 14 MealDB categories**. Existing restaurant products remain visible too: the local database's five saved products brought the verified total to **798**.

The old local API returned only five saved products, while the hosted QuickBite API returned 16. Neither was the original full MealDB catalogue. The original importer also capped each category at five recipes.

## What changed

- `/api/menu-items` now reads all MealDB categories, calls `filter.php?c=` for each, deduplicates recipe IDs and returns the complete catalogue. There is no five-item or frontend slice limit.
- The catalogue is cached for an hour; search, category and price filtering use that complete cached set. Restaurant-created items and manager overrides are merged on every request.
- `/api/menu-items/mealdb/<id>` calls the original `lookup.php?i=` endpoint for full details and ingredients. Direct external menu URLs use `mealdb_52772` identifiers to avoid confusing them with existing restaurant product IDs.
- Images come from each recipe's `strMealThumb`. Cards use MealDB's supported `/preview` thumbnails and lazy loading; details retain the original image. Saved restaurant images, Cloudinary uploads and the existing neutral fallback remain supported.
- Initial menu loading uses one inventory request. A failed category refresh cannot hide a successful inventory, and stale requests cannot replace current results. Categories derive from the actual returned items.
- MealDB recipe data does **not** include prices or restaurant stock. QuickBite retains its existing server-side category pricing policy and model defaults. Manager prices, availability and daily selections take priority; the client cannot submit its own price.
- New recipes are saved to restaurant tables only when explicitly ordered or edited by a manager, within the normal transaction. Listing/searching/details do not write or import anything.
- A new `mealdb_menu_links` table maintains stable recipe-to-restaurant IDs for ordering and manager controls. Migration: `d4e5f6a7b8c9`, following `c3d4e5f6a7b8`. No actual database migration was applied.

## Run the updated menu

**Restart your Flask process.** The running process inspected during investigation was returning older code (five products with null images). Stop it in its own terminal, then start the current code:

```bash
cd backend
../venv/bin/python run.py
```

In the frontend terminal, from the project root:

```bash
npm run dev
```

Keep `VITE_API_BASE_URL=/api` (the default) and let Vite proxy to the updated local Flask backend. Do not point the frontend at `https://www.themealdb.com` directly: the backend adapts recipe fields, preserves restaurant overrides and validates order prices.

Backend options, also documented in `backend/.env.example`:

```text
MEALDB_ENABLED=true
MEALDB_API_KEY=1
MEALDB_CACHE_SECONDS=3600
```

`1` is MealDB's documented public development/educational key. Use your own provider key where required for public deployment. Setting `MEALDB_ENABLED=false` restores the saved-restaurant-only catalogue.

Browsing the full menu works without importing recipes or changing the database. **Ordering newly discovered recipes and managing them requires the prepared migrations.** Follow the verified backup procedure in `IMPLEMENTATION_REPORT.md`; the actual database was intentionally left untouched. For the current unversioned SQLite database, the explicit, manual commands are:

```bash
venv/bin/python backend/manage_legacy_db.py --backup-only
# After verifying the backup and choosing to apply the update:
venv/bin/python backend/manage_legacy_db.py --apply
```

For an already-versioned database, after a verified backup use `flask --app run db upgrade` from `backend`. The new migration only creates the recipe-link table; its downgrade removes links, preserving restaurant meals and historical orders.

## Verification

- Live original API: 793 recipes, 14 categories; fetched without changing the actual database.
- Chromium using an isolated database copy: all 798 resulting menu products rendered; original MealDB images loaded for one sample in every category (14 successful samples); search and full meal details worked; no JavaScript page errors.
- New automated tests cover complete categories, more than five recipes per category, catalogue caching, source images, external ID preservation, atomic ordering with server prices, invalid-order rollback, manager overrides and visible upstream failure.
- Backend suite: 44 passed on SQLite and 44 passed on the isolated PostgreSQL test database. Frontend suite: 31 passed. ESLint and the production build passed. The recipe-link migration passed upgrade, schema comparison and rollback/re-upgrade on disposable SQLite and PostgreSQL databases.

Source endpoint documentation: [TheMealDB API](https://www.themealdb.com/api.php). An unavailable upstream returns a visible warning while retaining saved/last-complete meals, rather than silently pretending a partial catalogue is complete. The application shows all meals returned by the available API categories; it cannot expose recipes excluded by the provider's access level.


Test commands used:

```bash
cd backend
../venv/bin/python -m pytest tests -q
# Dedicated PostgreSQL test database only:
QUICKBITE_TEST_DATABASE_URL='postgresql+psycopg://surleen@/quickbite_test?host=/tmp/quickbite-pgsocket&port=55432&client_encoding=utf8' ../venv/bin/python -m pytest tests -q
cd ..
npm test
npm run lint
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/quickbite-browsers venv/bin/python frontend/scripts/verify-menu.py
```

The browser check used a separate Flask process on port 5502 and Vite on 5176 with `QUICKBITE_PROXY_TARGET=http://127.0.0.1:5502`, a database copy under `/tmp`, and a request guard blocking all API writes. The existing user backend and database were not replaced. Temporary test services were stopped after verification.
