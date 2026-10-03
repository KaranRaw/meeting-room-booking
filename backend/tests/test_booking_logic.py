import unittest
from datetime import time

from app.booking_logic import Interval, find_conflict, next_available, validate_times


class BookingLogicTests(unittest.TestCase):
    def setUp(self):
        self.meeting = Interval(7, "Planning", time(10), time(11))

    def test_all_overlap_shapes_identify_the_existing_booking(self):
        ranges = [(9, 30, 10, 30), (10, 30, 11, 30), (10, 15, 10, 45),
                  (9, 0, 12, 0), (10, 0, 11, 0)]
        for start_hour, start_minute, end_hour, end_minute in ranges:
            with self.subTest(start=(start_hour, start_minute)):
                conflict = find_conflict(
                    [self.meeting], time(start_hour, start_minute),
                    time(end_hour, end_minute),
                )
                self.assertEqual(conflict, self.meeting)

    def test_adjacent_bookings_on_both_sides_are_allowed(self):
        self.assertIsNone(find_conflict([self.meeting], time(9), time(10)))
        self.assertIsNone(find_conflict([self.meeting], time(11), time(12)))

    def test_conflict_selection_is_chronological(self):
        later = Interval(8, "Review", time(12), time(13))
        self.assertEqual(find_conflict([later, self.meeting], time(9), time(14)),
                         self.meeting)

    def test_invalid_booking_times(self):
        for start, end in [(time(11), time(10)), (time(10), time(10)),
                           (time(8, 59), time(10)), (time(17), time(18, 1)),
                           (time(9, 0, 1), time(10))]:
            with self.subTest(start=start, end=end):
                with self.assertRaises(ValueError):
                    validate_times(start, end)

    def test_entire_working_day_is_valid(self):
        validate_times(time(9), time(18))

    def test_empty_room_starts_at_opening(self):
        self.assertEqual(next_available([], 45), (time(9), time(9, 45)))
        self.assertEqual(next_available([], 540), (time(9), time(18)))

    def test_exact_gap_before_first_booking(self):
        self.assertEqual(next_available([self.meeting], 60), (time(9), time(10)))

    def test_exact_gap_between_unsorted_bookings(self):
        bookings = [Interval(2, "Second", time(11, 45), time(18)),
                    Interval(1, "First", time(9), time(11))]
        self.assertEqual(next_available(bookings, 45), (time(11), time(11, 45)))

    def test_exact_gap_after_last_booking(self):
        bookings = [Interval(1, "Long meeting", time(9), time(17, 15))]
        self.assertEqual(next_available(bookings, 45), (time(17, 15), time(18)))
        self.assertIsNone(next_available(bookings, 46))

    def test_fully_booked_room(self):
        self.assertIsNone(next_available([Interval(1, "Full day", time(9), time(18))], 1))

    def test_adjacent_bookings_do_not_create_a_gap(self):
        bookings = [Interval(1, "First", time(9), time(12)),
                    Interval(2, "Second", time(12), time(18))]
        self.assertIsNone(next_available(bookings, 1))

    def test_overlapping_imported_intervals_do_not_move_cursor_backwards(self):
        bookings = [Interval(1, "Outer", time(9), time(12)),
                    Interval(2, "Inner", time(10), time(11))]
        self.assertEqual(next_available(bookings, 30), (time(12), time(12, 30)))

    def test_short_gaps_are_skipped(self):
        bookings = [Interval(1, "First", time(9, 15), time(10)),
                    Interval(2, "Second", time(10, 15), time(11))]
        self.assertEqual(next_available(bookings, 45), (time(11), time(11, 45)))

    def test_invalid_durations(self):
        for duration in (0, -1, 541, True, 1.5):
            with self.subTest(duration=duration):
                with self.assertRaises(ValueError):
                    next_available([], duration)


if __name__ == "__main__":
    unittest.main()