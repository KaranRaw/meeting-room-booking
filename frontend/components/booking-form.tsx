"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";

import { ApiError, errorMessage, request } from "@/lib/api";
import { minutes, shortTime, validDate } from "@/lib/time";
import type { Booking, BookingSeed, Room } from "@/lib/types";
import { Dialog } from "./dialog";
import { useToast } from "./toasts";

type Props = {
  rooms: Room[];
  seed: BookingSeed;
  onClose: () => void;
  onCreated: (date: string) => void;
  onConflict: () => void;
};

export function BookingForm({ rooms, seed, onClose, onCreated, onConflict }: Props) {
  const [roomId, setRoomId] = useState(String(seed.room_id ?? rooms[0]?.id ?? ""));
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(seed.date ?? "");
  const [start, setStart] = useState(shortTime(seed.start_time ?? "09:00"));
  const [end, setEnd] = useState(shortTime(seed.end_time ?? "10:00"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notify = useToast();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMinutes = minutes(start);
    const endMinutes = minutes(end);
    let invalid = "";
    if (!rooms.some((room) => room.id === Number(roomId))) invalid = "Select a room.";
    else if (!title.trim() || title.trim().length > 120) invalid = "Title must contain 1-120 characters.";
    else if (!validDate(date)) invalid = "Enter a valid date.";
    else if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) invalid = "Enter both times in whole minutes.";
    else if (endMinutes <= startMinutes) invalid = "End time must be later than start time.";
    else if (startMinutes < 540 || endMinutes > 1080) invalid = "Bookings must be within working hours, 09:00-18:00.";
    if (invalid) {
      setError(invalid);
      notify(invalid, "error");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await request<{ message: string; booking: Booking }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ room_id: Number(roomId), title: title.trim(), date, start_time: start, end_time: end }),
      });
      notify(result.message);
      onCreated(date);
    } catch (failure) {
      const message = errorMessage(failure);
      setError(message);
      notify(message, "error");
      if (failure instanceof ApiError && failure.status === 409) onConflict();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="New booking" onClose={onClose} locked={saving}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <label className="field">Room
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)} disabled={saving} required>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name} - {room.capacity} people</option>)}
          </select>
        </label>
        <label className="field">Meeting title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120}
            placeholder="e.g. Product planning" disabled={saving} required />
        </label>
        <label className="field">Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={saving} required />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="field">Start time
            <input type="time" min="09:00" max="17:59" step={60} value={start}
              onChange={(event) => setStart(event.target.value)} disabled={saving} required />
          </label>
          <label className="field">End time
            <input type="time" min="09:01" max="18:00" step={60} value={end}
              onChange={(event) => setEnd(event.target.value)} disabled={saving} required />
          </label>
        </div>
        <p className="text-sm text-muted">Working hours: 09:00-18:00</p>
        {error && <p role="alert" className="error-text">{error}</p>}
        <div className="flex justify-end gap-3 pt-3">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Close</button>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
            {saving ? "Creating..." : "Create booking"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}