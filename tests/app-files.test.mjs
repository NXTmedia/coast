import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the PWA and offline route dataset", async () => {
  const [manifest, serviceWorker, route] = await Promise.all([
    readFile(new URL("public/manifest.webmanifest", root), "utf8").then(JSON.parse),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("public/data/swcp-route.json", root), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.display, "standalone");
  assert.doesNotMatch(serviceWorker, /tile\.openstreetmap\.org/);
  assert.match(serviceWorker, /\/data\/swcp-route\.json/);
  assert.match(serviceWorker, /PREPARE_OFFLINE/);
  assert.match(serviceWorker, /navigationResponse/);
  assert.doesNotMatch(serviceWorker, /return cached \?\? network/);
  assert.ok(route.points.filter(Boolean).length > 4000);
  assert.ok(route.officialDistanceKm > 95 && route.officialDistanceKm < 105);
  assert.match(route.geometrySource, /Supplied South West Coast Path GPX/);
  assert.match(route.elevationSource, /Supplied GPX elevation/);
  assert.deepEqual(route.checkpoints.map((point) => point.name), ["Penzance", "Porthleven", "Lizard Point", "Coverack", "Helford", "Falmouth"]);
});

test("includes the requested offline-first features", async () => {
  const app = await readFile(new URL("app/components/CoastPathApp.tsx", root), "utf8");
  const database = await readFile(new URL("app/lib/db.ts", root), "utf8");
  const days = await readFile(new URL("app/lib/days.ts", root), "utf8");
  const planning = await readFile(new URL("app/lib/planning.ts", root), "utf8");
  const matching = await readFile(new URL("app/lib/route.ts", root), "utf8");
  assert.match(database, /IndexedDB|Dexie|coastline-swcp/i);
  assert.match(database, /bundledRouteData/);
  assert.match(database, /normalizeDayOrders/);
  assert.match(days, /order: index \+ 1/);
  assert.match(app, /watchPosition/);
  assert.match(app, /Simulate GPS/);
  assert.match(app, /simulatedGpsNearCheckpoint/);
  assert.match(app, /ReferenceDot/);
  assert.match(app, /You are here/);
  assert.match(app, /Previous walking day/);
  assert.match(app, /Next walking day/);
  assert.match(app, /dayIdForDate\(loadedDays, localDateKey\(\)\)/);
  assert.match(app, /Start where the previous day ended/);
  assert.match(app, /Start location name/);
  assert.match(app, /End location name/);
  assert.match(app, /No walking days planned/);
  assert.match(app, /Match to trail/);
  assert.match(app, /nearestRoutePosition\(route, lng, lat\)/);
  assert.match(app, /Open \$\{selectedDay\.startName\} in Google Maps/);
  assert.match(app, /googleMapsUrl\(startLocation\)/);
  assert.match(app, /Verify start point in Google Maps/);
  assert.match(app, /Verify end point in Google Maps/);
  assert.match(app, /Saved start and end locations/);
  assert.match(app, /Match and save/);
  assert.doesNotMatch(app, /Fine-tune start/);
  assert.doesNotMatch(app, /Fine-tune end/);
  assert.match(app, /AreaChart/);
  assert.ok(app.indexOf('<section className="profile-card panel">') < app.indexOf('<section className="hero-row">'));
  assert.match(app, /<p className="eyebrow">Trail tracker<\/p>/);
  assert.doesNotMatch(app, /<Navigation size=\{14\} \/> Trail tracker/);
  assert.doesNotMatch(app, /CoastMap/);
  assert.match(planning, /totalPlannedDistanceKm/);
  assert.match(matching, /nearestRoutePosition/);
});
