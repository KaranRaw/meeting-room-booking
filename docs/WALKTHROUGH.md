# Code walkthrough

Use this to understand the source, not as a substitute for reading and running it. Be honest about assistance used and any checks not yet performed.

## Read these files in order

1. `backend/app/booking_logic.py`: no HTTP or database dependencies, just interval rules.
2. `backend/tests/test_booking_logic.py`: concrete inputs for the required boundaries.
3. `backend/migrations/001_initial.sql`: schema, seed rooms, working-hour checks, exclusion constraint, indexes.
4. `backend/app/schemas.py`: trims titles and validates requests with Pydantic.
5. `backend/app/services.py`: room lookup, locking, conflict detection, insert/cancel, next slot.
6. `backend/app/main.py`: thin REST routes and safe exception responses.
7. `frontend/lib/api.ts`: response messages, timeout, and network errors.
8. `frontend/components/booking-form.tsx`: pre-request validation and conflict messages.
9. `frontend/app/page.tsx`: loading, filters, refreshing, modal state, cancellation.

## Why the overlap rule works

Two intervals do not overlap if one ends at or before the other starts. Negate those two non-overlap cases and you get the rule used in the code:

```text
new_start < existing_end AND new_end > existing_start
```

For an existing 10:00-11:00 meeting:

| Request | Reason | Result |
| --- | --- | --- |
| 09:30-10:30 | Starts before, ends inside | Conflict |
| 10:30-11:30 | Starts inside, ends after | Conflict |
| 10:15-10:45 | Entirely inside | Conflict |
| 09:00-12:00 | Encloses the existing meeting | Conflict |
| 10:00-11:00 | Same boundaries | Conflict |
| 09:00-10:00 | Ends exactly at existing start | Allowed |
| 11:00-12:00 | Starts exactly at existing end | Allowed |

## Walk through slot finding by hand

For bookings 09:00-10:30 and 11:15-13:00, request 45 minutes:

1. Cursor starts at 09:00. No gap before the first meeting.
2. Move the cursor to 10:30.
3. Next meeting starts at 11:15. The gap is exactly 45 minutes.
4. Return 10:30-11:15. Do not require a strictly larger gap.

For a full-day booking, cursor ends at 18:00, so even a one-minute request has no slot. A requested suggestion can become occupied before creation; the create endpoint rechecks it.

## Why locking matters

Without a lock, requests A and B could both read an empty schedule before either inserts. Both would think the slot was free. A room-row lock makes B wait until A commits. B then reads A's booking and returns a conflict. Locks are taken only for mutations; listing and slot suggestions do not reserve anything. The database exclusion constraint protects the invariant even if another tool inserts directly.

## Choices worth discussing

- Plain local date/time values match the specified one-office working day; a multi-timezone product would need an explicit room timezone model.
- Physical deletion is enough for cancellation here; audit history would need cancellation metadata instead.
- Locks serialize writes for the entire room. This is simpler than finer-grained locking and reasonable for five rooms.
- Business algorithms are framework-independent; database orchestration is in services and HTTP mapping is in routes.
- The room/date/start index serves filtered chronological reads; a separate date index serves all-room day views.
- Error responses have a consistent `message`; the UI does not invent generic messages when the backend supplies one.
- The date is hydrated on the browser so server/browser timezone differences do not produce mismatched initial dates.
- Requests are aborted when filters change, and the displayed data is keyed to the active filters to prevent stale schedules.
- Public demo access is not production authorization. Ownership/security requirements would change the schema and endpoints.

Before your interview, add a test case yourself, predict its result, run it, and trace the request from the form to the database. Explain the actual implementation and its limits rather than claiming verification that has not happened.
