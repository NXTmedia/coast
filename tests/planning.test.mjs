import assert from "node:assert/strict";
import test from "node:test";
import {
  breakDateAfter,
  cleanPlannedPointsOfInterest,
  dateKeyAfter,
  dayIdContainingDistance,
  dayIdForDate,
  dayDistanceKm,
  daysUsingLocation,
  fillWalkingDayDates,
  localDateKey,
  nextPointOfInterest,
  plannedProgressKm,
  resolvePointsOfInterest,
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

test("locations used by planned stages are identified before deletion", () => {
  const days = [
    day({ id: "one", startName: "Mousehole", endName: "Penzance" }),
    day({ id: "two", startName: "Penzance", endName: "Porthleven" }),
  ];
  assert.deepEqual(daysUsingLocation(days, "Penzance").map(({ id }) => id), ["one", "two"]);
  assert.deepEqual(daysUsingLocation(days, "Falmouth"), []);
});

test("planned points of interest resolve from saved locations and select the next one ahead", () => {
  const checkpoints = [
    { name: "Penzance", lat: 50.1, lng: -5.5, distanceKm: 26.5 },
    { name: "Porthleven", lat: 50.08, lng: -5.31, distanceKm: 50.2 },
    { name: "Lizard Point", lat: 49.96, lng: -5.2, distanceKm: 77.8 },
  ];
  const points = [
    { id: "lizard", locationName: "Lizard Point" },
    { id: "missing", locationName: "Not on this route" },
    { id: "porthleven", locationName: "Porthleven" },
  ];
  const plannedDays = [day({ startDistanceKm: 20, endDistanceKm: 60 })];

  assert.deepEqual(resolvePointsOfInterest(points, checkpoints).map(({ name }) => name), ["Porthleven", "Lizard Point"]);
  assert.deepEqual(cleanPlannedPointsOfInterest(points, checkpoints, plannedDays), [{ id: "porthleven", locationName: "Porthleven" }]);
  assert.deepEqual(nextPointOfInterest(points, checkpoints, plannedDays, 45), {
    point: { id: "porthleven", locationName: "Porthleven", ...checkpoints[1] },
    distanceRemainingKm: 5.200000000000003,
  });
  assert.equal(nextPointOfInterest(points, checkpoints, plannedDays, 80), null);
});

test("orphaned points of interest are removed when no walking stage contains them", () => {
  const checkpoints = [
    { name: "Inside", lat: 50, lng: -5, distanceKm: 15 },
    { name: "Orphan", lat: 50, lng: -4.9, distanceKm: 30 },
  ];
  const points = [
    { id: "inside", locationName: "Inside" },
    { id: "orphan", locationName: "Orphan" },
    { id: "duplicate", locationName: "Inside" },
  ];
  const plannedDays = [day({ startDistanceKm: 10, endDistanceKm: 20 })];

  assert.deepEqual(cleanPlannedPointsOfInterest(points, checkpoints, plannedDays), [{ id: "inside", locationName: "Inside" }]);
  assert.equal(nextPointOfInterest(points, checkpoints, plannedDays, 20), null);
});
