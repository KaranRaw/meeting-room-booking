"use client";

import { AnimatePresence } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Clock3, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { BookingForm } from "@/components/booking-form";
import { Dialog } from "@/components/dialog";
import { RoomSchedule } from "@/components/room-schedule";
import { SlotFinder } from "@/components/slot-finder";
import { useToast } from "@/components/toasts";
import { ApiError, errorMessage, request } from "@/lib/api";
import { readableDate, shortTime, today, validDate } from "@/lib/time";
import type { Booking, BookingSeed, Room } from "@/lib/types";

const subscribeToDate = () => () => {};
const serverDate = () => "";

export default function Home() {
  const localDate = useSyncExternalStore(subscribeToDate, today, serverDate);
  const [chosenDate, setDate] = useState<string | null>(null);
  const date = chosenDate ?? localDate;
  const [roomFilter, setRoomFilter] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [seed, setSeed] = useState<BookingSeed | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const notify = useToast();
  const queryKey = `${date}:${roomFilter}:${revision}`;
  const loading = !date || loadedKey !== queryKey;

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams({ date });
        if (roomFilter) query.set("room_id", roomFilter);
        const [roomData, bookingData] = await Promise.all([
          request<Room[]>("/api/rooms", { signal: controller.signal }),
          request<Booking[]>(`/api/bookings?${query}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setRooms(roomData);
        setBookings(bookingData);
        setLoadError("");
      } catch (failure) {
        if (controller.signal.aborted) return;
        const message = errorMessage(failure);
        setLoadError(message);
        notify(message, "error");
      } finally {
        if (!controller.signal.aborted) setLoadedKey(queryKey);
      }
    }
    void load();
    return () => controller.abort();
  }, [date, roomFilter, queryKey, notify]);

  function moveDay(offset: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + offset);
    setDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`);
  }

  function refresh() { setRevision((current) => current + 1); }

  async function cancel() {
    if (!cancelling) return;
    setCancelBusy(true);
    setCancelError("");
    try {
      const result = await request<{ message: string }>(`/api/bookings/${cancelling.id}`, { method: "DELETE" });
      notify(result.message);
      setCancelling(null);
      refresh();
    } catch (failure) {
      const message = errorMessage(failure);
      setCancelError(message);
      notify(message, "error");
      if (failure instanceof ApiError && failure.status === 404) {
        setCancelling(null);
        refresh();
      }
    } finally {
      setCancelBusy(false);
    }
  }

  const visibleRooms = roomFilter ? rooms.filter((room) => room.id === Number(roomFilter)) : rooms;

  return (
    <>
      <header className="site-header">
        <div className="site-container header-inner">
          <a className="brand" href="/" aria-label="Room bookings home"><CalendarDays size={24} /><span>Room Bookings</span></a>
          <span className="working-hours"><Clock3 size={16} aria-hidden="true" />09:00-18:00</span>
        </div>
      </header>
      <main className="site-container main-content">
        <div className="page-heading">
          <div><p className="eyebrow">Daily schedule</p><h1>Meeting rooms</h1></div>
          <button className="button primary" disabled={loading || !!loadError || !rooms.length}
            onClick={() => setSeed({ date, room_id: Number(roomFilter) || rooms[0]?.id })}>
            <Plus size={18} />New booking
          </button>
        </div>
        <section className="filter-bar" aria-label="Schedule filters">
          <div className="date-controls">
            <button className="icon-button" title="Previous day" aria-label="Previous day" disabled={!date}
              onClick={() => moveDay(-1)}><ChevronLeft size={20} /></button>
            <label className="sr-only" htmlFor="schedule-date">Selected date</label>
            <input id="schedule-date" type="date" value={date} onChange={(event) => {
              if (validDate(event.target.value)) setDate(event.target.value);
            }} />
            <button className="icon-button" title="Next day" aria-label="Next day" disabled={!date}
              onClick={() => moveDay(1)}><ChevronRight size={20} /></button>
          </div>
          <div className="room-filter">
            <label htmlFor="room-filter">Room</label>
            <select id="room-filter" value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}>
              <option value="">All rooms</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </div>
          <button className="icon-button refresh-button" title="Refresh schedule" aria-label="Refresh schedule"
            onClick={refresh} disabled={loading}><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
        </section>
        <div className="schedule-heading">
          <h2>{date ? readableDate(date) : "Schedule"}</h2>
          {!loading && !loadError && <span>{bookings.length} {bookings.length === 1 ? "booking" : "bookings"}</span>}
        </div>
        <div className="workspace">
          <section className="schedule" aria-label="Room schedules" aria-busy={loading}>
            {loading ? (
              <div role="status" aria-label="Loading room schedules" className="space-y-4">
                {[0, 1, 2].map((item) => <div key={item} className="skeleton-room"><div /><div /><div /></div>)}
                <p className="sr-only">Loading rooms and bookings...</p>
              </div>
            ) : loadError ? (
              <div className="empty-state"><CircleAlert size={28} /><h3>Schedule unavailable</h3><p>{loadError}</p>
                <button className="button secondary" onClick={refresh}><RefreshCw size={16} />Try again</button>
              </div>
            ) : visibleRooms.length === 0 ? (
              <div className="empty-state"><CalendarDays size={28} /><h3>No rooms available</h3><p>The database needs its initial room setup.</p></div>
            ) : visibleRooms.map((room, index) => (
              <RoomSchedule key={room.id} room={room} index={index}
                bookings={bookings.filter((booking) => booking.room_id === room.id)}
                onBook={() => setSeed({ room_id: room.id, date })}
                onCancel={(booking) => { setCancelError(""); setCancelling(booking); }} />
            ))}
          </section>
          <aside>
            {!loading && !loadError && rooms.length > 0 && (
              <SlotFinder key={`${date}:${roomFilter}:${revision}`} rooms={rooms} date={date}
                initialRoom={roomFilter} onBook={setSeed} />
            )}
          </aside>
        </div>
      </main>
      <footer className="site-container site-footer">Room Bookings <span>Local room time</span></footer>
      <AnimatePresence>
        {seed && <BookingForm key="booking" rooms={rooms} seed={seed} onClose={() => setSeed(null)}
          onConflict={refresh} onCreated={(createdDate) => { setSeed(null); setDate(createdDate); refresh(); }} />}
        {cancelling && (
          <Dialog key="cancel" title="Cancel booking?" locked={cancelBusy} onClose={() => setCancelling(null)}>
            <p className="cancel-title">{cancelling.title}</p>
            <p className="text-sm text-muted mt-2">{rooms.find((room) => room.id === cancelling.room_id)?.name}
              {" / "}{cancelling.date}{" / "}{shortTime(cancelling.start_time)}-{shortTime(cancelling.end_time)}</p>
            {cancelError && <p className="error-text mt-4" role="alert">{cancelError}</p>}
            <div className="flex justify-end gap-3 mt-7 flex-wrap">
              <button className="button secondary" disabled={cancelBusy} onClick={() => setCancelling(null)}>Keep booking</button>
              <button className="button danger" disabled={cancelBusy} onClick={() => void cancel()}>
                {cancelBusy ? <LoaderCircle size={17} className="animate-spin" /> : <Trash2 size={17} />}
                {cancelBusy ? "Cancelling..." : "Cancel booking"}
              </button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}