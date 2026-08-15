import assert from "node:assert/strict";
import test from "node:test";
import {
  ascentDescent, googleMapsUrl, nearestRoutePosition, pointsForDay,
  simulatedGpsNearCheckpoint,
} from "../app/lib/route.ts";

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
  checkpoints: [{ name: "Lynmouth", lng: -3.95, lat: 50, distanceKm: 5 }],
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

test("GPS simulation creates an iPhone-like reading just after Lynmouth", () => {
  const gps = simulatedGpsNearCheckpoint(route);
  assert.ok(gps);
  assert.equal(gps.accuracy, 6);
  assert.equal(gps.speed, 1.35);
  const match = nearestRoutePosition(route, gps.longitude, gps.latitude);
  assert.ok(match);
  assert.ok(Math.abs(match.distanceKm - 7) < 0.01);
  assert.ok(match.offRouteM < 1);
});

test("Google Maps links contain the exact endpoint coordinates", () => {
  const link = new URL(googleMapsUrl({ lat: 50.1234564, lng: -4.6543214 }));
  assert.equal(link.origin, "https://www.google.com");
  assert.equal(link.pathname, "/maps/search/");
  assert.equal(link.searchParams.get("api"), "1");
  assert.equal(link.searchParams.get("query"), "50.123456,-4.654321");
});
