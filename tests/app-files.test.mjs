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
  assert.match(serviceWorker, /tile\.openstreetmap\.org/);
  assert.match(serviceWorker, /\/data\/swcp-route\.json/);
  assert.ok(route.points.filter(Boolean).length > 4000);
  assert.ok(route.officialDistanceKm >= 1000);
});

test("includes the requested offline-first features", async () => {
  const app = await readFile(new URL("app/components/CoastPathApp.tsx", root), "utf8");
  const database = await readFile(new URL("app/lib/db.ts", root), "utf8");
  const matching = await readFile(new URL("app/lib/route.ts", root), "utf8");
  assert.match(database, /IndexedDB|Dexie|coastline-swcp/i);
  assert.match(app, /watchPosition/);
  assert.match(app, /Start where the previous day ended/);
  assert.match(app, /Match to trail/);
  assert.match(app, /nearestRoutePosition\(route, lng, lat\)/);
  assert.match(app, /AreaChart/);
  assert.match(matching, /nearestRoutePosition/);
});
