import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from urllib.parse import urlparse

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

pytestmark = pytest.mark.integration
DAY = "2026-09-15"


@pytest.fixture(scope="module")
def engine():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test.")
    database_name = urlparse(url).path.rstrip("/").split("/")[-1]
    if not database_name.endswith("_test"):
        pytest.fail("Safety check: TEST_DATABASE_URL database name must end in _test.")
    url = url.replace("postgres://", "postgresql://", 1)
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    database = create_engine(url, pool_pre_ping=True)
    migration = Path(__file__).resolve().parents[1] / "migrations" / "001_initial.sql"
    with database.connect() as connection:
        connection.connection.driver_connection.execute(
            migration.read_text(encoding="utf-8"), prepare=False
        )
        connection.commit()
    yield database
    database.dispose()


@pytest.fixture
def client(engine, monkeypatch):
    from app.config import get_settings
    from app.database import get_session

    monkeypatch.setenv("DATABASE_URL", str(engine.url.render_as_string(hide_password=False)))
    get_settings.cache_clear()
    from app.main import app

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE bookings RESTART IDENTITY"))

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def payload(client, start="10:00", end="11:00", room_id=None, title="Planning", day=DAY):
    room_id = room_id or client.get("/api/rooms").json()[0]["id"]
    return {"room_id": room_id, "title": title, "date": day,
            "start_time": start, "end_time": end}


def test_rooms_health_and_docs(client):
    rooms = client.get("/api/rooms")
    assert rooms.status_code == 200
    assert len(rooms.json()) == 5
    assert client.get("/api/health").status_code == 200
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


@pytest.mark.parametrize("start,end", [
    ("09:30", "10:30"), ("10:30", "11:30"), ("10:15", "10:45"),
    ("09:00", "12:00"), ("10:00", "11:00"),
])
def test_overlap_rejections_identify_booking(client, start, end):
    original = client.post("/api/bookings", json=payload(client)).json()["booking"]
    rejected = client.post("/api/bookings", json=payload(client, start, end))
    assert rejected.status_code == 409
    assert rejected.json()["conflicting_booking"] == original
    assert "Planning" in rejected.json()["message"]
    assert f"#{original['id']}" in rejected.json()["message"]


def test_back_to_back_and_different_rooms_or_dates(client):
    rooms = client.get("/api/rooms").json()
    assert client.post("/api/bookings", json=payload(client)).status_code == 201
    assert client.post("/api/bookings", json=payload(client, "09:00", "10:00")).status_code == 201
    assert client.post("/api/bookings", json=payload(client, "11:00", "12:00")).status_code == 201
    assert client.post("/api/bookings", json=payload(client, room_id=rooms[1]["id"])).status_code == 201
    assert client.post("/api/bookings", json=payload(client, day="2026-09-16")).status_code == 201


@pytest.mark.parametrize("start,end", [
    ("11:00", "10:00"), ("10:00", "10:00"), ("08:59", "10:00"),
    ("17:00", "18:01"), ("09:00:01", "10:00"), ("09:00Z", "10:00Z"),
])
def test_invalid_times_return_400(client, start, end):
    response = client.post("/api/bookings", json=payload(client, start, end))
    assert response.status_code == 400
    assert response.json()["message"]


@pytest.mark.parametrize("field,value", [
    ("title", "   "), ("title", "x" * 121), ("room_id", 0),
    ("date", "not-a-date"), ("start_time", "bad-time"),
])
def test_invalid_input_returns_400(client, field, value):
    body = payload(client)
    body[field] = value
    assert client.post("/api/bookings", json=body).status_code == 400


def test_filtering_cancellation_and_slot_reuse(client):
    original = client.post("/api/bookings", json=payload(client, "09:00", "18:00"))
    assert original.status_code == 201
    booking = original.json()["booking"]
    room_id = booking["room_id"]
    listing = client.get(f"/api/bookings?date={DAY}&room_id={room_id}")
    assert listing.json() == [booking]
    assert client.get("/api/bookings?date=2026-09-16").json() == []
    assert client.get(f"/api/rooms/{room_id}/next-available?date={DAY}&duration=45").json()["available"] is False
    assert client.delete(f"/api/bookings/{booking['id']}").status_code == 200
    assert client.delete(f"/api/bookings/{booking['id']}").status_code == 404
    assert client.get(f"/api/bookings?date={DAY}").json() == []
    slot = client.get(f"/api/rooms/{room_id}/next-available?date={DAY}&duration=45")
    assert slot.status_code == 200
    assert slot.json()["start_time"] == "09:00:00"
    assert slot.json()["end_time"] == "09:45:00"


def test_exact_middle_gap(client):
    room_id = client.get("/api/rooms").json()[0]["id"]
    client.post("/api/bookings", json=payload(client, "09:00", "11:00", room_id))
    client.post("/api/bookings", json=payload(client, "11:45", "18:00", room_id))
    slot = client.get(f"/api/rooms/{room_id}/next-available?date={DAY}&duration=45").json()
    assert slot["start_time"] == "11:00:00"
    assert slot["end_time"] == "11:45:00"


def test_not_found_and_query_validation(client):
    assert client.post("/api/bookings", json=payload(client, room_id=999999)).status_code == 404
    assert client.get(f"/api/bookings?date={DAY}&room_id=999999").status_code == 404
    assert client.get(f"/api/rooms/999999/next-available?date={DAY}&duration=45").status_code == 404
    assert client.get("/api/bookings?date=invalid").status_code == 400
    room_id = client.get("/api/rooms").json()[0]["id"]
    for duration in ("0", "-1", "541", "1.5", "abc"):
        assert client.get(f"/api/rooms/{room_id}/next-available?date={DAY}&duration={duration}").status_code == 400
    assert client.delete("/api/bookings/0").status_code == 400


def test_simultaneous_requests_cannot_double_book(client, engine):
    from app.schemas import BookingCreate
    from app.services import create_booking

    body = BookingCreate(**payload(client))
    barrier = Barrier(2)

    def reserve():
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                return 201, create_booking(session, body).id
            except HTTPException as error:
                return error.status_code, error.detail["conflicting_booking"]["id"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: reserve(), range(2)))
    assert sorted(status for status, _ in results) == [201, 409]
    assert results[0][1] == results[1][1]
    assert len(client.get(f"/api/bookings?date={DAY}").json()) == 1


def test_database_constraint_rejects_direct_overlapping_sql(client, engine):
    from sqlalchemy.exc import IntegrityError

    booking = client.post("/api/bookings", json=payload(client)).json()["booking"]
    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO bookings (room_id, title, booking_date, start_time, end_time) "
                "VALUES (:room, 'Direct insert', :day, '10:30', '11:30')"
            ), {"room": booking["room_id"], "day": DAY})


def test_database_error_does_not_leak_details(client):
    from app.database import get_session
    from app.main import app

    previous = app.dependency_overrides[get_session]

    def broken_session():
        raise SQLAlchemyError("private connection information")

    app.dependency_overrides[get_session] = broken_session
    try:
        response = client.get("/api/rooms", headers={"Origin": "http://localhost:3000"})
        assert response.status_code == 500
        assert "private connection information" not in response.text
        assert "temporarily unavailable" in response.json()["message"]
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    finally:
        app.dependency_overrides[get_session] = previous