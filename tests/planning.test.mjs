import assert from "node:assert/strict";
import test from "node:test";
import {
  copyPreviousDayEnd,
  breakDateAfter,
  dateKeyAfter,
  dayIdContainingDistance,
  dayIdForDate,
  dayDistanceKm,
  fillWalkingDayDates,
  localDateKey,
  plannedProgressKm,
  renameDayLocation,
  totalPlannedDistanceKm,
} from "../app/lib/planning.ts";

const day = (overrides = {}) => ({
  id: "day-1",
  order: 1,
  date: "",
  startName: "Start",
  endName: "End",
  startDistanceKm: 10,
  endDistanceKm: 20,
  ...overrides,
});

test("the whole plan is the sum of planned sections, including gaps", () => {
  const days = [
    day({ id: "one", startDistanceKm: 10, endDistanceKm: 18 }),
    day({ id: "two", startDistanceKm: 30, endDistanceKm: 42.5 }),
  ];
  assert.equal(dayDistanceKm(days[0]), 8);
  assert.equal(totalPlannedDistanceKm(days), 20.5);
});

test("whole-plan progress only counts distance inside planned sections", () => {
  const days = [
    day({ id: "one", startDistanceKm: 10, endDistanceKm: 20 }),
    day({ id: "two", startDistanceKm: 30, endDistanceKm: 40 }),
  ];
  assert.equal(plannedProgressKm(days, 5), 0);
  assert.equal(plannedProgressKm(days, 15), 5);
  assert.equal(plannedProgressKm(days, 25), 10);
  assert.equal(plannedProgressKm(days, 35), 15);
  assert.equal(plannedProgressKm(days, 50), 20);
});

test("custom location names are stored on the correct boundary", () => {
  const original = day();
  const namedStart = renameDayLocation(original, "start", "The harbour steps");
  const namedEnd = renameDayLocation(namedStart, "end", "Café by the beach");
  assert.equal(namedEnd.startName, "The harbour steps");
  assert.equal(namedEnd.endName, "Café by the beach");
  assert.equal(original.startName, "Start");
});

test("using the previous end copies its custom name, distance and coordinates", () => {
  const previous = day({
    endName: "Our overnight cottage",
    endDistanceKm: 27.4,
    endCoordinate: { lat: 50.1, lng: -4.2, offRouteM: 7 },
  });
  const next = day({ id: "day-2", order: 2, startDistanceKm: 0 });
  const copied = copyPreviousDayEnd(next, previous);
  assert.equal(copied.startName, "Our overnight cottage");
  assert.equal(copied.startDistanceKm, 27.4);
  assert.deepEqual(copied.startCoordinate, previous.endCoordinate);
});

test("today's dated walking day is selected when the app opens", () => {
  const days = [
    day({ id: "first", date: "2026-08-15" }),
    day({ id: "today", date: "2026-08-16" }),
  ];
  assert.equal(localDateKey(new Date(2026, 7, 16, 23, 30)), "2026-08-16");
  assert.equal(dayIdForDate(days, "2026-08-16"), "today");
  assert.equal(dayIdForDate(days, "2026-08-20"), "first");
  assert.equal(dayIdForDate([], "2026-08-16"), "");
});

test("a start date schedules stages and inserted break days across month and year boundaries", () => {
  const days = [
    day({ id: "first", order: 1, breakAfter: true }),
    day({ id: "second", order: 2, date: "2028-05-12" }),
    day({ id: "third", order: 3 }),
  ];
  const scheduled = fillWalkingDayDates(days, "2026-12-30");
  assert.deepEqual(scheduled.map(({ date }) => date), ["2026-12-30", "2027-01-01", "2027-01-02"]);
  assert.equal(breakDateAfter(scheduled[0]), "2026-12-31");
  assert.equal(dateKeyAfter("2028-02-28", 1), "2028-02-29");
  assert.equal(days[1].date, "2028-05-12");
});

test("a GPS position selects the planned day containing that trail distance", () => {
  const days = [
    day({ id: "one", startDistanceKm: 0, endDistanceKm: 20 }),
    day({ id: "lynmouth", startDistanceKm: 43, endDistanceKm: 64 }),
  ];
  assert.equal(dayIdContainingDistance(days, 45), "lynmouth");
  assert.equal(dayIdContainingDistance(days, 30), undefined);
});
