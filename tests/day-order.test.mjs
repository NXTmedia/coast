import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDayOrders, removeLegacyStarterDays } from "../app/lib/days.ts";

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

test("removes obsolete bundled starter days during the Penzance route upgrade", () => {
  const days = [
    { ...day("old-1", 1), startName: "Minehead", endName: "Porlock Weir" },
    { ...day("old-2", 2), startName: "Porlock Weir", endName: "Lynmouth" },
    { ...day("planned", 3), startName: "Penzance", endName: "Porthleven" },
  ];
  assert.deepEqual(removeLegacyStarterDays(days).map(({ id }) => id), ["planned"]);
});
