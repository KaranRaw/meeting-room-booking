"use client";

import { motion } from "framer-motion";
import { Plus, Trash2, Users } from "lucide-react";

import { minutes, shortTime } from "@/lib/time";
import type { Booking, Room } from "@/lib/types";

type Props = {
  room: Room;
  bookings: Booking[];
  index: number;
  onBook: () => void;
  onCancel: (booking: Booking) => void;
};

export function RoomSchedule({ room, bookings, index, onBook, onCancel }: Props) {
  const bookedMinutes = bookings.reduce((total, booking) => total + minutes(booking.end_time) - minutes(booking.start_time), 0);
  const freeMinutes = 540 - bookedMinutes;

  return (
    <motion.article className={`room room-color-${(room.id - 1) % 5}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.15) }} aria-labelledby={`room-${room.id}`}>
      <div className="room-header">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 id={`room-${room.id}`}>{room.name}</h3>
            <span className="room-capacity"><Users size={14} aria-hidden="true" />{room.capacity}</span>
            <span className="room-free">{freeMinutes === 0 ? "Fully booked" : `${Math.floor(freeMinutes / 60)}h ${freeMinutes % 60}m free`}</span>
          </div>
          <p className="room-equipment">{room.equipment}</p>
        </div>
        <button className="icon-button room-add" onClick={onBook} aria-label={`Book ${room.name}`} title={`Book ${room.name}`}>
          <Plus size={20} />
        </button>
      </div>
      <div className="timeline" aria-hidden="true">
        {bookings.map((booking) => (
          <div className="timeline-booking" key={booking.id}
            title={`${booking.title}: ${shortTime(booking.start_time)}-${shortTime(booking.end_time)}`}
            style={{ left: `${(minutes(booking.start_time) - 540) / 540 * 100}%`,
              width: `${(minutes(booking.end_time) - minutes(booking.start_time)) / 540 * 100}%` }}>
            <span>{booking.title}</span>
          </div>
        ))}
      </div>
      <div className="time-axis" aria-hidden="true"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div>
      {bookings.length === 0 ? (
        <p className="room-empty">No bookings for this date.</p>
      ) : (
        <ul className="booking-list">
          {bookings.map((booking) => (
            <motion.li key={booking.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <span className="booking-time">{shortTime(booking.start_time)}-{shortTime(booking.end_time)}</span>
              <span className="booking-title">{booking.title}</span>
              <button className="icon-button danger-icon" onClick={() => onCancel(booking)}
                aria-label={`Cancel ${booking.title}`} title={`Cancel ${booking.title}`}>
                <Trash2 size={17} />
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.article>
  );
}