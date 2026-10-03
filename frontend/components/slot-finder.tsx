"use client";

import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { errorMessage, request } from "@/lib/api";
import { shortTime, validDate } from "@/lib/time";
import type { BookingSeed, Room, Slot } from "@/lib/types";
import { useToast } from "./toasts";

type Props = { rooms: Room[]; date: string; initialRoom: string; onBook: (seed: BookingSeed) => void };

export function SlotFinder({ rooms, date, initialRoom, onBook }: Props) {
  const [roomId, setRoomId] = useState(initialRoom || String(rooms[0]?.id ?? ""));
  const [duration, setDuration] = useState("45");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Slot | null>(null);
  const alive = useRef(true);
  const notify = useToast();

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function find(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rooms.some((room) => room.id === Number(roomId)) || !validDate(date)) {
      notify("Select a valid room and date.", "error");
      return;
    }
    if (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 540) {
      notify("Duration must be between 1 and 540 whole minutes.", "error");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const slot = await request<Slot>(`/api/rooms/${roomId}/next-available?date=${date}&duration=${duration}`);
      if (!alive.current) return;
      setResult(slot);
      notify(slot.message, slot.available ? "success" : "info");
    } catch (failure) {
      if (alive.current) notify(errorMessage(failure), "error");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section className="slot-finder" aria-labelledby="slot-heading">
      <h2 id="slot-heading" className="mb-5">Next available slot</h2>
      <form className="space-y-4" onSubmit={find} noValidate>
        <label className="field">Room
          <select value={roomId} disabled={busy} onChange={(event) => { setRoomId(event.target.value); setResult(null); }}>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
        <label className="field">Duration (minutes)
          <input type="number" min={1} max={540} step={1} value={duration} disabled={busy}
            onChange={(event) => { setDuration(event.target.value); setResult(null); }} />
        </label>
        <button className="button secondary w-full" disabled={busy || !rooms.length || !date}>
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Search size={17} />}
          {busy ? "Searching..." : "Find slot"}
        </button>
      </form>
      {result && (
        <div className="slot-result" role="status">
          {result.available && result.start_time && result.end_time ? (
            <>
              <p className="slot-time">{shortTime(result.start_time)} <span>to</span> {shortTime(result.end_time)}</p>
              <button className="button primary w-full mt-4" onClick={() => onBook({
                room_id: result.room_id, date: result.date,
                start_time: result.start_time!, end_time: result.end_time!,
              })}>Book this slot <ArrowRight size={17} /></button>
            </>
          ) : <p className="text-sm">{result.message}</p>}
        </div>
      )}
    </section>
  );
}