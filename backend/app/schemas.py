from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.booking_logic import validate_times


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    capacity: int
    equipment: str


class BookingCreate(BaseModel):
    room_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=120)
    date: date
    start_time: time
    end_time: time

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def valid_time_range(self):
        validate_times(self.start_time, self.end_time)
        return self


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    title: str
    date: date
    start_time: time
    end_time: time


class BookingCreated(BaseModel):
    message: str
    booking: BookingRead


class Message(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    message: str
    conflicting_booking: BookingRead | None = None


class SlotRead(BaseModel):
    room_id: int
    date: date
    duration: int
    available: bool
    start_time: time | None
    end_time: time | None
    message: str