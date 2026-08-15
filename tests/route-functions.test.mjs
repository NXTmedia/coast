import assert from "node:assert/strict";
import test from "node:test";
import { ascentDescent, nearestRoutePosition, pointsForDay } from "../app/lib/route.ts";

const route = {
  id: "test-route",
  name: "Test route",
  officialDistanceKm: 10,
  generatedAt: "2026-01-01T00:00:00.000Z",
  elevationSource: "test",
  geometrySource: "test",
  points: [
    { lng: -4, lat: 50, elevationM: 10, distanceKm: 0 },
    { lng: -3.95, lat: 50, elevationM: 40, distanceKm: 5 },
    { lng: -3.9, lat: 50, elevationM: 20, distanceKm: 10 },
  ],
  checkpoints: [],
};

test("coordinates are matched to the nearest position along the route", () => {
  const match = nearestRoutePosition(route, -3.95, 50.001);
  assert.ok(match);
  assert.ok(Math.abs(match.distanceKm - 5) < 0.01);
  assert.ok(match.offRouteM > 100 && match.offRouteM < 120);
});

test("day profiles are sliced by distance and ascent/descent is calculated", () => {
  const profile = pointsForDay(route, 0, 10);
  assert.equal(profile.length, 3);
  assert.deepEqual(ascentDescent(profile), { ascent: 30, descent: 20 });
});
