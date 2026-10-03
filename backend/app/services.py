from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.booking_logic import Interval, find_conflict, next_available
from app.models import Booking, Room
from app.schemas import BookingCreate, BookingRead, SlotRead


def require_room(session: Session, room_id: int, lock: bool = False) -> Room:
    statement = select(Room).where(Room.id == room_id)
    if lock:
        statement = statement.with_for_update()
    room = session.scalar(statement)
    if room is None:
        raise HTTPException(404, "Room not found.")
    return room


def list_bookings(session: Session, day: date, room_id: int | None = None) -> list[Booking]:
    statement = select(Booking).where(Booking.date == day)
    if room_id is not None:
        statement = statement.where(Booking.room_id == room_id)
    return list(session.scalars(statement.order_by(Booking.start_time, Booking.id)))


def intervals(bookings: list[Booking]) -> list[Interval]:
    return [Interval(item.id, item.title, item.start_time, item.end_time) for item in bookings]


def conflict_error(booking: Interval, room_name: str, room_id: int, day: date) -> HTTPException:
    return HTTPException(
        409,
        detail={
            "message": (
                f'Conflicts with "{booking.title}" in {room_name} on {day.isoformat()} '
                f'({booking.start_time:%H:%M}-{booking.end_time:%H:%M}), '
                f'booking #{booking.id}.'
            ),
            "conflicting_booking": {
                "id": booking.id,
                "room_id": room_id,
                "title": booking.title,
                "date": day.isoformat(),
                "start_time": booking.start_time.isoformat(),
                "end_time": booking.end_time.isoformat(),
            },
        },
    )


def create_booking(session: Session, payload: BookingCreate) -> BookingRead:
    # Lock before reading: concurrent requests must see the first request's commit.
    room = require_room(session, payload.room_id, lock=True)
    room_name = room.name
    existing = intervals(list_bookings(session, payload.date, payload.room_id))
    conflict = find_conflict(existing, payload.start_time, payload.end_time)
    if conflict:
        raise conflict_error(conflict, room_name, payload.room_id, payload.date)

    booking = Booking(**payload.model_dump())
    session.add(booking)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        if getattr(error.orig, "sqlstate", None) != "23P01":
            raise
        # The database constraint also protects inserts made outside this API.
        existing = intervals(list_bookings(session, payload.date, payload.room_id))
        conflict = find_conflict(existing, payload.start_time, payload.end_time)
        if conflict:
            raise conflict_error(conflict, room_name, payload.room_id, payload.date) from error
        raise HTTPException(409, "Availability changed. Please refresh and try again.") from error
    session.refresh(booking)
    return BookingRead.model_validate(booking)


def cancel_booking(session: Session, booking_id: int) -> str:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(404, "Booking not found. It may already have been cancelled.")
    room_id = booking.room_id
    require_room(session, room_id, lock=True)
    # Re-read after waiting for the lock in case another request cancelled it.
    booking = session.scalar(
        select(Booking).where(Booking.id == booking_id).execution_options(populate_existing=True)
    )
    if booking is None:
        raise HTTPException(404, "Booking not found. It may already have been cancelled.")
    title = booking.title
    session.delete(booking)
    session.commit()
    return f'Booking "{title}" cancelled.'


def find_slot(session: Session, room_id: int, day: date, duration: int) -> SlotRead:
    room = require_room(session, room_id)
    slot = next_available(intervals(list_bookings(session, day, room_id)), duration)
    message = (
        f"Earliest free slot in {room.name}: {slot[0]:%H:%M}-{slot[1]:%H:%M}."
        if slot else f"No {duration}-minute slot is available in {room.name} on {day.isoformat()}."
    )
    return SlotRead(
        room_id=room_id, date=day, duration=duration, available=slot is not None,
        start_time=slot[0] if slot else None, end_time=slot[1] if slot else None,
        message=message,
    )