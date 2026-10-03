import logging
from datetime import date as Date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Path, Query
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import services
from app.config import get_settings
from app.database import get_session
from app.models import Room
from app.schemas import (
    BookingCreate, BookingCreated, BookingRead, ErrorResponse, Message, RoomRead, SlotRead,
)

logger = logging.getLogger(__name__)
app = FastAPI(title="Meeting Room Booking API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)
SessionDep = Annotated[Session, Depends(get_session)]
ERRORS = {400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


@app.exception_handler(StarletteHTTPException)
async def http_error(request, error):
    content = error.detail if isinstance(error.detail, dict) else {"message": error.detail}
    return JSONResponse(status_code=error.status_code, content=jsonable_encoder(content))


@app.exception_handler(RequestValidationError)
async def validation_error(request, error):
    messages = []
    for issue in error.errors():
        field = ".".join(str(part) for part in issue["loc"] if part not in ("body", "query"))
        messages.append(f"{field}: {issue['msg']}" if field else issue["msg"])
    return JSONResponse(status_code=400, content={"message": "; ".join(messages)})


@app.exception_handler(SQLAlchemyError)
async def database_error(request, error):
    logger.exception("Database request failed", exc_info=error)
    return JSONResponse(status_code=500, content={
        "message": "The database is temporarily unavailable. Please try again."
    })


@app.exception_handler(Exception)
async def server_error(request, error):
    logger.exception("Unexpected request failure", exc_info=error)
    response = JSONResponse(status_code=500, content={
        "message": "An unexpected server error occurred. Please try again."
    })
    # Unhandled errors sit outside CORSMiddleware; preserve the readable error body.
    origin = request.headers.get("origin")
    if origin in get_settings().cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response


@app.get("/api/health", response_model=Message)
def health(session: SessionDep):
    session.execute(text("SELECT 1"))
    return {"message": "API and PostgreSQL are healthy."}


@app.get("/api/rooms", response_model=list[RoomRead])
def rooms(session: SessionDep):
    return list(session.scalars(select(Room).order_by(Room.id)))


@app.get("/api/bookings", response_model=list[BookingRead], responses=ERRORS)
def bookings(session: SessionDep, date: Date, room_id: int | None = Query(None, gt=0)):
    if room_id is not None:
        services.require_room(session, room_id)
    return services.list_bookings(session, date, room_id)


@app.post("/api/bookings", response_model=BookingCreated, status_code=201,
          responses={**ERRORS, 409: {"model": ErrorResponse}})
def book(payload: BookingCreate, session: SessionDep):
    booking = services.create_booking(session, payload)
    return {"message": f'Booking "{booking.title}" created.', "booking": booking}


@app.delete("/api/bookings/{booking_id}", response_model=Message, responses=ERRORS)
def cancel(booking_id: Annotated[int, Path(gt=0)], session: SessionDep):
    return {"message": services.cancel_booking(session, booking_id)}


@app.get("/api/rooms/{room_id}/next-available", response_model=SlotRead, responses=ERRORS)
def next_slot(
    room_id: int, session: SessionDep, date: Date,
    duration: Annotated[int, Query(ge=1, le=540)],
):
    if room_id <= 0:
        raise HTTPException(400, "Room ID must be positive.")
    return services.find_slot(session, room_id, date, duration)