import assert from "node:assert/strict";
import test from "node:test";
import { breakDayCount, normalizeDayOrders, reorderWalkingDays } from "../app/lib/days.ts";

const day = (id, order) => ({
  id,
  order,
  date: "",
  startName: `${id} start`,
  endName: `${id} end`,
  startDistanceKm: order,
  endDistanceKm: order + 1,
});

test("closes numbering gaps after a day is deleted", () => {
  const normalized = normalizeDayOrders([day("second", 2), day("third", 3)]);
  assert.deepEqual(normalized.map(({ id, order }) => ({ id, order })), [
    { id: "second", order: 1 },
    { id: "third", order: 2 },
  ]);
});

test("sorts and renumbers days without mutating stored records", () => {
  const original = [day("third", 7), day("first", 1), day("second", 3)];
  const normalized = normalizeDayOrders(original);
  assert.deepEqual(normalized.map(({ id, order }) => ({ id, order })), [
    { id: "first", order: 1 },
    { id: "second", order: 2 },
    { id: "third", order: 3 },
  ]);
  assert.deepEqual(original.map(({ order }) => order), [7, 1, 3]);
});

test("reorders stages, renumbers them and keeps breaks at their itinerary position", () => {
  const days = [
    { ...day("one", 1), breakDaysAfter: 2 },
    day("two", 2),
    day("three", 3),
  ];
  const reordered = reorderWalkingDays(days, "three", "one");
  assert.deepEqual(reordered.map(({ id, order }) => ({ id, order })), [
    { id: "three", order: 1 }, { id: "one", order: 2 }, { id: "two", order: 3 },
  ]);
  assert.deepEqual(reordered.map(breakDayCount), [2, 0, 0]);
});

test("normalizing migrates a legacy break and clears breaks after the final stage", () => {
  const normalized = normalizeDayOrders([
    { ...day("first", 1), breakAfter: true },
    { ...day("last", 2), breakDaysAfter: 3 },
  ]);
  assert.deepEqual(normalized.map(breakDayCount), [1, 0]);
  assert.deepEqual(normalized.map(({ breakAfter }) => breakAfter), [undefined, undefined]);
});
