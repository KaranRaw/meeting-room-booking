# Meeting Room Booking System

A daily meeting-room schedule with booking, cancellation, room/date filters, conflict detection, and an earliest-free-slot finder.

Stack: Next.js App Router, TypeScript, Tailwind CSS, Framer Motion, Lucide icons; Python FastAPI, SQLAlchemy, and PostgreSQL (Neon for the tested local setup). The booking algorithms are handwritten and do not use a scheduling library.

## Verification status

The application has been successfully set up and manually tested on the development PC.

Verified locally:
- Backend dependencies installed successfully.
- Frontend dependencies installed successfully.
- Neon PostgreSQL connection verified.
- Database initialized successfully.
- Tables, constraints, indexes, and five rooms created.
- FastAPI application starts successfully.
- FastAPI `/docs` is accessible.
- API health endpoint verified.
- Room API verified after database initialization.
- Frontend starts successfully.
- Frontend communicates with the FastAPI backend.
- Full application flow was manually tested successfully.

Automated unit/integration/browser test suites, production build verification, and deployment are separate release checks and should be run before deployment.

No public GitHub repository, Vercel URL, or Render URL is included yet. Deployment instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Features

- Five seeded rooms: Cedar, Maple, Birch, Willow, and Oak.
- Daily schedules, proportional booking timelines, date navigation, and room filtering.
- Booking title, room, date, start/end times with client and backend validation.
- Cancellation with confirmation; a cancelled slot becomes available again.
- Exact backend messages in success/error/info toasts.
- Next available slot for any whole-minute duration from 1 to 540 minutes.
- Keyboard-trapped dialogs, reduced-motion support, loading/error/empty states.
- PostgreSQL constraints and transactions to prevent simultaneous double booking.
- Interactive API documentation at `/docs`.

## Prerequisites

Install:
- Node.js with npm.
- Python 3.12 with pip.
- Git, if publishing the repository or retaining Git history.
- A PostgreSQL database. The tested setup uses Neon PostgreSQL.
- Internet access for dependency installation and deployment.
- A local PostgreSQL server, pgAdmin, or `psql` is not required when using Neon.

Windows PowerShell commands below do not require changing execution policy.

## 1. Database setup

The tested development setup uses Neon PostgreSQL.

Create a Neon PostgreSQL project/database and obtain its connection string.

The connection string should remain private and should never be committed to GitHub or placed in the frontend.

Example:
```
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

Do not use the real database password in documentation.

## 2. Backend setup

From the project root:

```powershell
cd backend
python -m venv .venv
```

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the project dependencies:

```powershell
pip install -r requirements.txt
```

Create `backend/.env`:

```dotenv
DATABASE_URL=<your-Neon-connection-string>
CORS_ORIGINS=["http://localhost:3000"]
```

For hosted PostgreSQL, use the provider's connection string and `sslmode=require` when required.

Never put `DATABASE_URL` in the frontend.

### Initialize the database

The project includes a database initializer:

```powershell
.\.venv\Scripts\python.exe -m app.init_db
```

The initializer creates the database schema, constraints, indexes, and exactly five rooms.

It is safe to rerun for the initial schema and does not delete existing bookings.

### Start the API

```powershell
uvicorn app.main:app --reload
```

The API runs at:
http://127.0.0.1:8000

Useful endpoints:
- API health: `http://127.0.0.1:8000/api/health`
- API docs: `http://127.0.0.1:8000/docs`
- Room list: `http://127.0.0.1:8000/api/rooms`

Leave the backend terminal running while using the frontend.

## 3. Frontend setup

Open a second terminal at the project root:

```powershell
cd frontend
npm install
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the frontend:

```powershell
npm run dev
```

Open:
http://localhost:3000

The first screen is the room schedule.

If Next.js starts on a different port, add that exact frontend origin to backend `CORS_ORIGINS`, restart the API, and use the new frontend URL.

Browser requests should consistently use `localhost`, not a mixture of `localhost` and `127.0.0.1`.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Backend only | PostgreSQL connection string; required |
| `CORS_ORIGINS` | Backend only | JSON array of allowed browser origins |
| `NEXT_PUBLIC_API_URL` | Frontend | API base URL without `/api` |
| `TEST_DATABASE_URL` | Backend test terminal | Disposable test database; never the real booking database |
| `TEST_API_URL` | Frontend test terminal | Backend URL used by Playwright |

Keep `.env` and `.env.local` private.

Example files contain only development placeholders.

## Booking logic

All times are local wall-clock times for the rooms, not UTC. Working hours are 09:00–18:00, with a strictly positive duration and whole-minute precision.

### Conflict detection

Bookings are half-open intervals `[start, end)`.

Two meetings overlap exactly when:
```
new_start < existing_end AND new_end > existing_start
```

This covers:
- Partial overlap at the beginning.
- Partial overlap at the end.
- One booking completely inside another.
- One booking completely containing another.
- Identical time ranges.

Strict comparisons allow back-to-back bookings:
```
10:00–11:00
11:00–12:00
```

When several bookings overlap a request, the API identifies the earliest existing booking, ordered by start time and then ID.

A `409 Conflict` response contains details about the conflicting booking.

The service locks the room row before reading bookings and keeps the lock until commit/rollback. PostgreSQL's exclusion constraint independently prevents overlapping direct SQL inserts.

Cancellation uses the same room-level locking strategy.

### Next available slot

The algorithm starts a cursor at 09:00 and sorts the room's bookings by start time.

For each booking:
- Check the gap between the cursor and the booking start.
- If the gap is at least the requested duration, return the earliest slot in that gap.
- Otherwise move the cursor to the later of its current position and the booking's end time.

After all bookings, check the remaining time until 18:00.

An exact-sized gap is accepted.

A fully booked room returns:
```json
{
  "available": false
}
```

The next-slot result is a suggestion, not a reservation. Creating the booking performs conflict detection again.

Sorting costs `O(n log n)` and scanning costs `O(n)`.

## API

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/rooms` | Seeded rooms, 200 |
| GET | `/api/bookings?date=2026-09-15&room_id=1` | Date-filtered bookings; room optional, 200 |
| POST | `/api/bookings` | Creates a booking, 201 |
| DELETE | `/api/bookings/{booking_id}` | Cancels a booking, 200 |
| GET | `/api/rooms/1/next-available?date=2026-09-15&duration=45` | Earliest slot or no available slot, 200 |
| GET | `/api/health` | API + database health, 200 |

Invalid input returns 400, missing rooms/bookings return 404, overlaps return 409, and server failures return 500 with a safe message.

Errors use:
```json
{
  "message": "..."
}
```

Conflict responses also include `conflicting_booking`.

### Create booking body

```json
{
  "room_id": 1,
  "title": "Product planning",
  "date": "2026-09-15",
  "start_time": "10:00",
  "end_time": "11:00"
}
```

## Testing and release checks

The application has been manually tested end-to-end during local development.

Before production deployment, run the project's automated checks from [docs/TESTING.md](docs/TESTING.md), including:
- Unit tests.
- PostgreSQL integration tests.
- Browser/Playwright tests.
- Frontend lint.
- Production build.
- Desktop/mobile screenshot checks.

Do not treat skipped integration tests as a passing database check.

After dependency installation, retain `frontend/package-lock.json` for reproducible frontend installs.

For a reproducible Python environment, a tested `pip freeze` output can be retained alongside the requirements files.

## Structure

```
backend/app/booking_logic.py   Pure conflict and gap algorithms
backend/app/services.py        Database-backed booking workflows
backend/app/main.py            Routes and safe error responses
backend/app/schemas.py         Pydantic input/output models
backend/migrations/             PostgreSQL schema and seed data
backend/tests/                  Unit + PostgreSQL integration tests
frontend/app/                   Next.js pages and styles
frontend/components/            Booking, cancellation, schedule, slot finder, toasts
frontend/lib/                   Typed API client and time helpers
frontend/tests/                 Browser workflows and responsive screenshots
docs/                            Testing, deployment, and code walkthrough
compose.yaml                     Optional local PostgreSQL container
render.yaml                      Render backend blueprint
```

## Git history transfer

The package includes `repository-history.bundle`, an export of local source commits. The ZIP intentionally excludes `.git`, dependencies, credentials, and build artifacts.

To restore history, from the directory containing the extracted project:

```powershell
git clone .\meeting-room-booking\repository-history.bundle meeting-room-booking-repo
cd meeting-room-booking-repo
git remote remove origin
```

Continue setup in the cloned folder.

If previous history is not required, run:
```powershell
git init
```
in the extracted source instead.

## What is unfinished or intentionally excluded

- Automated release tests, production build verification, and browser screenshot checks should still be run before deployment.
- Public GitHub repository and deployed Vercel/Render URLs still need to be created and verified.
- Authentication and booking ownership are not in scope: anyone with access can view, create, or cancel bookings. Deploy only as a demo unless access control is added.
- Schedules refresh after mutations and manual refresh; there is no cross-client live push.
- One shared local room timezone is assumed.
- Recurring meetings and room-creation screens are not included.

For a focused explanation before the walkthrough interview, read [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).
