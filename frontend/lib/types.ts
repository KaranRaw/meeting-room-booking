export type Room = {
  id: number;
  name: string;
  capacity: number;
  equipment: string;
};

export type Booking = {
  id: number;
  room_id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
};

export type BookingInput = Omit<Booking, "id">;
export type BookingSeed = Partial<BookingInput>;

export type Slot = {
  room_id: number;
  date: string;
  duration: number;
  available: boolean;
  start_time: string | null;
  end_time: string | null;
  message: string;
};