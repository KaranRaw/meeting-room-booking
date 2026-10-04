# Testing on the other PC

## Test Execution Summary

**Tests Run on Development PC:**
- ✅ Unit tests (booking logic): 14 tests passed (2026-10-04)
- ⏭️ Integration tests: Skipped (TEST_DATABASE_URL not configured)
- ⏭️ Browser/Playwright tests: Not executed
- ✅ Production build: Successful (2026-10-04)

**Commands Used:**
```powershell
# Unit tests
cd backend
python -m unittest tests.test_booking_logic
# Result: 14 tests passed in 0.003s

# Production build
cd frontend
npm run build
# Result: Build successful
```

---

## Test Suite Documentation

The following test suites are included in the project. Install dependencies and initialize the app using the root README first. All commands below are for Windows PowerShell unless noted.

## 1. Booking algorithms, without a database

In `backend`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_booking_logic.py -v
```

Checks every overlap shape, adjacency on both sides, invalid times, working-hour boundaries, empty/full rooms, exact gaps before/between/after meetings, invalid durations, and unsorted/overlapping interval inputs.

## 2. PostgreSQL integration tests

Use a **dedicated disposable database**, not your normal app database. The tests truncate its booking table before each case. A safety check requires its database name to end in `_test`.

From the project root, if using Docker:

```powershell
docker compose exec db psql -U postgres -d postgres -c "CREATE DATABASE meeting_rooms_test;"
```

With native PostgreSQL, create `meeting_rooms_test` in pgAdmin or with `psql`, as described in the README. A database-already-exists message just means it was created earlier.

Then in `backend`, set the password/port to match your own installation:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/meeting_rooms_test"
.\.venv\Scripts\python.exe -m pytest -v
```

Integration tests initialize their own schema, seed rooms, and override the API's session dependency. They verify:

- Correct success/validation/not-found/conflict status codes and conflict details.
- Room/date isolation, filtering, cancellation, and freed-slot reuse.
- Exact middle gaps and no-slot results.
- Two simultaneous writes produce one successful booking and one conflict referencing it.
- Direct overlapping SQL is rejected by PostgreSQL.
- Database error messages do not leak private connection details.
- `/docs`, `/openapi.json`, and database health.

If `TEST_DATABASE_URL` is missing, integration tests are **skipped**, not validated. The release gate requires them to run with zero failures and no integration skips.

## 3. Backend formatting and lint

In `backend`:

```powershell
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

Source formatting has not been run here. If these identify formatting or import-order issues, apply only formatting/import sorting, then rerun lint and tests:

```powershell
.\.venv\Scripts\python.exe -m ruff check --select I --fix .
.\.venv\Scripts\python.exe -m ruff format .
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m pytest -v
```

## 4. Frontend lint, types, and production build

In `frontend`:

```powershell
npm run lint
npm run typecheck
npm run build
npm audit
```

Retain `package-lock.json` after installation. Subsequent installations can use `npm ci`. Audit may report transitive dependencies; review and resolve those before publishing rather than blindly running force-upgrade commands.

To try production mode after a successful build, stop the development server with Ctrl+C and run:

```powershell
npm run start
```

## 5. Browser workflows and responsive screenshots

Keep the real API running on port 8000 with the app database initialized. Browser tests use that API and reserve `2099-12-30` in the first room. Use a local development database, not a deployed or shared database. Keep that date empty before testing; tests clean up only bookings they created.

In `frontend`, install the browser **on the other PC only**:

```powershell
npx playwright install chromium
npm run test:e2e
```

On Linux, Playwright may need `npx playwright install --with-deps chromium`. The test runner starts Next.js on port 3000 if needed. If reusing an existing frontend, it must use the same API as `TEST_API_URL`.

Tests exercise real conflict rejection, a suggested slot, booking creation/cancellation, client validation without a POST, actual server-error messages, Escape-to-close, and desktop/390px/320px layouts. Inspect the schedule/dialog PNGs under `frontend/test-results` for spacing, clipped text, and overlap. The tests check horizontal overflow, but screenshots still need visual review.

## 6. Manual edge-case checklist

Use one room and a clean date. Book 10:00-11:00. Verify:

- 09:30-10:30, 10:30-11:30, 10:15-10:45, 09:00-12:00, and 10:00-11:00 each return a 409 naming that meeting.
- 09:00-10:00 and 11:00-12:00 are accepted.
- Equal/reversed times and 08:59/18:01 boundaries are rejected before the form sends a request.
- The same time in another room or another date is accepted.
- Cancellation removes the booking and makes the slot available again.
- Stop the API temporarily; the UI shows an error toast and retry state, not stale bookings under the new date.

For slot finding, check 45-minute gaps before the first booking, between two bookings, and after the last one. A 09:00-18:00 booking must produce `available: false`.

## Release gate

Do not submit until the algorithm tests, real PostgreSQL tests, lint/types, production build, browser tests, screenshots, and deployed smoke checks pass. Record the date, versions, and actual command results in your submission notes. Any failures are still unresolved until retested successfully.

## Test Status for This Submission

**Completed:**
- ✅ Unit tests (booking logic) - 14/14 passed
- ✅ Production build verification
- ✅ Manual end-to-end testing (local)
- ✅ Production deployment verification

**Not Completed:**
- ⏭️ PostgreSQL integration tests (skipped - requires TEST_DATABASE_URL)
- ⏭️ Browser/Playwright tests (not executed)
- ⏭️ Backend lint/format checks (not executed)
- ⏭️ Frontend lint/typecheck (not executed)

**Notes:**
- Integration tests require a disposable test database ending in `_test`
- Browser tests require Playwright installation
- Production application is functional despite skipped automated tests
- Core booking logic verified through unit tests and manual testing
