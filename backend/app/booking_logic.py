from dataclasses import dataclass
from datetime import time

OPENING_TIME = time(9, 0)
CLOSING_TIME = time(18, 0)


@dataclass(frozen=True)
class Interval:
    id: int
    title: str
    start_time: time
    end_time: time


def validate_times(start_time: time, end_time: time) -> None:
    if start_time.tzinfo is not None or end_time.tzinfo is not None:
        raise ValueError("Use local room times without a timezone.")
    if any(value.second or value.microsecond for value in (start_time, end_time)):
        raise ValueError("Booking times must use whole minutes.")
    if end_time <= start_time:
        raise ValueError("End time must be later than start time.")
    if start_time < OPENING_TIME or end_time > CLOSING_TIME:
        raise ValueError("Bookings must be within working hours, 09:00-18:00.")


def find_conflict(
    bookings: list[Interval], start_time: time, end_time: time
) -> Interval | None:
    validate_times(start_time, end_time)
    for booking in sorted(bookings, key=lambda item: (item.start_time, item.id)):
        # Half-open intervals let one meeting end exactly when the next begins.
        if start_time < booking.end_time and end_time > booking.start_time:
            return booking
    return None


def minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def clock(value: int) -> time:
    return time(value // 60, value % 60)


def next_available(
    bookings: list[Interval], duration: int
) -> tuple[time, time] | None:
    if isinstance(duration, bool) or not isinstance(duration, int):
        raise ValueError("Duration must be a whole number of minutes.")
    if not 1 <= duration <= 540:
        raise ValueError("Duration must be between 1 and 540 minutes.")

    cursor = minutes(OPENING_TIME)
    closing = minutes(CLOSING_TIME)
    for booking in sorted(bookings, key=lambda item: (item.start_time, item.id)):
        gap_end = min(minutes(booking.start_time), closing)
        # Equality is deliberate: a gap of exactly the requested size is enough.
        if gap_end - cursor >= duration:
            return clock(cursor), clock(cursor + duration)
        # max also keeps the scan correct if imported data contains overlaps.
        cursor = max(cursor, minutes(booking.end_time))
    if closing - cursor >= duration:
        return clock(cursor), clock(cursor + duration)
    return None