import assert from "node:assert/strict";
import test from "node:test";
import {
  ascentBetween, ascentDescent, migrateCheckpointsToRoute, migrateDaysToRoute, nearestRoutePosition, osMapsUrl,
  plannedAscentM, prepareRouteImport, pointsForDay, simulatedGpsNearCheckpoint,
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
  checkpoints: [{ name: "Lizard Point", lng: -3.95, lat: 50, distanceKm: 5 }],
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

test("remaining ascent includes partial climbs for a day and the whole plan", () => {
  const climbingRoute = {
    ...route,
    officialDistanceKm: 30,
    points: [
      { lng: -4, lat: 50, elevationM: 0, distanceKm: 0 },
      { lng: -3.9, lat: 50, elevationM: 100, distanceKm: 10 },
      { lng: -3.8, lat: 50, elevationM: 50, distanceKm: 20 },
      { lng: -3.7, lat: 50, elevationM: 150, distanceKm: 30 },
    ],
  };
  const plannedDays = [
    { id: "one", order: 1, date: "", startName: "A", endName: "B", startDistanceKm: 0, endDistanceKm: 10 },
    { id: "two", order: 2, date: "", startName: "C", endName: "D", startDistanceKm: 20, endDistanceKm: 30 },
  ];

  assert.equal(ascentBetween(climbingRoute, 0, 10), 100);
  assert.equal(ascentBetween(climbingRoute, 5, 10), 50);
  assert.equal(plannedAscentM(climbingRoute, plannedDays), 200);
  assert.equal(plannedAscentM(climbingRoute, plannedDays, 5), 150);
  assert.equal(plannedAscentM(climbingRoute, plannedDays, 15), 100);
  assert.equal(plannedAscentM(climbingRoute, plannedDays, 35), 0);
});

test("GPS simulation creates an iPhone-like reading 3 km after Lizard Point", () => {
  const gps = simulatedGpsNearCheckpoint(route);
  assert.ok(gps);
  assert.equal(gps.accuracy, 6);
  assert.equal(gps.speed, 1.35);
  const match = nearestRoutePosition(route, gps.longitude, gps.latitude);
  assert.ok(match);
  assert.ok(Math.abs(match.distanceKm - 8) < 0.01);
  assert.ok(match.offRouteM < 1);
});

test("saved walking days migrate from the old bundled route by endpoint coordinates", () => {
  const target = {
    ...route,
    id: "target",
    points: route.points.map((point) => point && ({ ...point, distanceKm: point.distanceKm * 2 })),
    officialDistanceKm: 20,
  };
  const days = [{
    id: "planned", order: 1, date: "", startName: "Start", endName: "End",
    startDistanceKm: 0, endDistanceKm: 10,
  }];
  const migrated = migrateDaysToRoute(days, route, target);
  assert.equal(migrated.length, 1);
  assert.ok(Math.abs(migrated[0].startDistanceKm) < 0.01);
  assert.ok(Math.abs(migrated[0].endDistanceKm - 20) < 0.01);
});

test("saved locations migrate onto an extended bundled route", () => {
  const checkpoints = [{ name: "Custom harbour", lng: -3.95, lat: 50.001, distanceKm: 5 }];
  const migrated = migrateCheckpointsToRoute(checkpoints, route);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, "Custom harbour");
  assert.ok(Math.abs(migrated[0].distanceKm - 5) < 0.01);
  assert.ok(migrated[0].lat < 50.00001);
});

test("a route import preserves matching locations and planned stages", () => {
  const source = {
    ...route,
    checkpoints: [
      { name: "Start village", lng: -4, lat: 50, distanceKm: 0 },
      { name: "Finish village", lng: -3.9, lat: 50, distanceKm: 10 },
      { name: "Distant place", lng: -6, lat: 52, distanceKm: 6 },
    ],
  };
  const target = {
    ...route,
    id: "imported",
    checkpoints: [
      { name: "Route start", lng: -4, lat: 50, distanceKm: 0 },
      { name: "Route end", lng: -3.9, lat: 50, distanceKm: 10 },
    ],
  };
  const planned = [{
    id: "day-1", order: 1, date: "2026-09-01", startName: "Start village", endName: "Finish village",
    startDistanceKm: 0, endDistanceKm: 10,
  }];
  const prepared = prepareRouteImport(source, target, planned);
  assert.equal(prepared.matchedLocationCount, 2);
  assert.deepEqual(prepared.route.checkpoints.map((point) => point.name), ["Start village", "Finish village"]);
  assert.equal(prepared.days.length, 1);
  assert.equal(prepared.days[0].date, "2026-09-01");
});

test("OS Maps links contain exact coordinates and the fixed Leisure map settings", () => {
  const link = new URL(osMapsUrl({ lat: 50.1234564, lng: -4.6543214 }));
  assert.equal(link.origin, "https://explore.osmaps.com");
  assert.equal(link.pathname, "/");
  assert.equal(link.searchParams.get("lat"), "50.123456");
  assert.equal(link.searchParams.get("lon"), "-4.654321");
  assert.equal(link.searchParams.get("zoom"), "13.0000");
  assert.equal(link.searchParams.get("style"), "Leisure");
  assert.equal(link.searchParams.get("type"), "2d");
  assert.equal(
    osMapsUrl({ lat: 50.1186, lng: -5.5377 }),
    "https://explore.osmaps.com/?lat=50.118600&lon=-5.537700&zoom=13.0000&style=Leisure&type=2d",
  );
});
