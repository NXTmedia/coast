import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the PWA and offline route dataset", async () => {
  const [manifest, serviceWorker, route, index] = await Promise.all([
    readFile(new URL("public/manifest.json", root), "utf8").then(JSON.parse),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("app/data/swcp-route.json", root), "utf8").then(JSON.parse),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.doesNotMatch(serviceWorker, /tile\.openstreetmap\.org/);
  assert.doesNotMatch(serviceWorker, /\/data\/swcp-route\.json/);
  assert.match(serviceWorker, /PREPARE_OFFLINE/);
  assert.match(serviceWorker, /navigationResponse/);
  assert.match(serviceWorker, /shellAssetsFromHtml/);
  assert.match(serviceWorker, /cacheAssetGraph/);
  assert.match(serviceWorker, /importedAssetsFromText/);
  assert.match(serviceWorker, /hasExpectedContentType/);
  assert.match(serviceWorker, /READY_MARKER/);
  assert.match(serviceWorker, /hasCachedShell/);
  assert.match(serviceWorker, /if \(!ready\) throw new Error\("The complete app shell could not be cached"\)/);
  assert.doesNotMatch(serviceWorker, /return cached \?\? network/);
  assert.equal(route.id, "swcp-gpx-full-mainline-2026-04");
  assert.equal(route.points.filter(Boolean).length, 38_409);
  assert.equal(route.points.filter((point) => point === null).length, 10);
  assert.ok(route.officialDistanceKm > 1025 && route.officialDistanceKm < 1026);
  assert.match(route.geometrySource, /complete main path Parts 1–11/);
  assert.match(route.elevationSource, /Supplied GPX elevation/);
  assert.match(index, /maximum-scale=1/);
  assert.match(index, /user-scalable=no/);
  assert.match(await readFile(new URL("app/globals.css", root), "utf8"), /touch-action: pan-x pan-y/);
  assert.equal(route.checkpoints.length, 53);
  assert.equal(route.checkpoints[0].name, "Minehead");
  assert.equal(route.checkpoints.at(-1).name, "South Haven Point");
  assert.ok(route.checkpoints.some((point) => point.name === "Westward Ho!"));
  assert.ok(route.checkpoints.some((point) => point.name === "The Lizard"));
  assert.ok(route.checkpoints.some((point) => point.name === "Ferry Bridge (Wyke Regis)"));
  assert.equal(route.checkpoints[0].distanceKm, 0);
  assert.ok(route.checkpoints.at(-1).distanceKm > 1025 && route.checkpoints.at(-1).distanceKm < 1025.3);
});

test("builds as a static Vite app configured for Netlify", async () => {
  const [packageJson, lockfile, vite, index, entry, netlify] = await Promise.all([
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
    readFile(new URL("package-lock.json", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/main.tsx", root), "utf8"),
    readFile(new URL("netlify.toml", root), "utf8"),
  ]);

  assert.equal(packageJson.scripts.build, "vite build");
  assert.match(packageJson.scripts.dev, /^vite /);
  assert.equal(packageJson.devDependencies.vinext, undefined);
  assert.equal(packageJson.devDependencies.wrangler, undefined);
  assert.equal(packageJson.devDependencies["@cloudflare/vite-plugin"], undefined);
  assert.doesNotMatch(lockfile, /node_modules\/(?:vinext|wrangler|@cloudflare\/vite-plugin)/);
  assert.match(vite, /@vitejs\/plugin-react/);
  assert.doesNotMatch(vite, /vinext|cloudflare|sites\(/i);
  assert.match(index, /<div id="root"><\/div>/);
  assert.match(index, /src="\/src\/main\.tsx"/);
  assert.match(entry, /createRoot\(root\)\.render\(<CoastPathApp \/>\)/);
  assert.match(netlify, /command = "npm run build"/);
  assert.match(netlify, /publish = "dist"/);
  assert.match(netlify, /to = "\/index\.html"/);
  assert.match(netlify, /for = "\/sw\.js"/);
  assert.match(netlify, /for = "\/manifest\.json"/);
  assert.match(netlify, /Content-Type = "application\/manifest\+json; charset=utf-8"/);
  await Promise.all([
    "app/layout.tsx", "app/page.tsx", "build/sites-vite-plugin.ts", "next-env.d.ts",
    "next.config.ts", "worker/index.ts", ".openai/hosting.json",
  ].map((path) => assert.rejects(access(new URL(path, root)))));
});

test("includes the requested offline-first features", async () => {
  const app = await readFile(new URL("app/components/CoastPathApp.tsx", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  const database = await readFile(new URL("app/lib/db.ts", root), "utf8");
  const days = await readFile(new URL("app/lib/days.ts", root), "utf8");
  const planning = await readFile(new URL("app/lib/planning.ts", root), "utf8");
  const matching = await readFile(new URL("app/lib/route.ts", root), "utf8");
  assert.match(database, /IndexedDB|Dexie|coastline-swcp/i);
  assert.match(database, /bundledRouteData/);
  assert.match(database, /normalizeDayOrders/);
  assert.match(database, /swcp-gpx-mousehole-falmouth-2026-04/);
  assert.match(database, /previousBundledIds/);
  assert.match(database, /checkpointsByName/);
  assert.match(database, /pointsOfInterest: "id, locationName"/);
  assert.match(database, /this\.version\(2\)/);
  assert.match(days, /order: index \+ 1/);
  assert.match(app, /watchPosition/);
  assert.match(app, /Simulate GPS/);
  assert.match(app, /simulatedGpsNearCheckpoint/);
  assert.match(app, /<strong>Track GPS<\/strong>/);
  assert.match(app, /gps\.latitude\.toFixed\(6\)/);
  assert.match(app, /gps\.longitude\.toFixed\(6\)/);
  assert.match(app, /Accuracy ±\{Math\.round\(gps\.accuracy\)\} metres/);
  assert.match(app, /Tap the location button at the top right to start GPS/);
  assert.match(app, /setTrackGps\(false\)/);
  assert.match(app, /error\.code === 1/);
  assert.match(app, /navigator\.geolocation\.clearWatch\(id\)/);
  assert.match(app, /setWatchId\(\(current\) => current === id \? null : current\)/);
  assert.match(styles, /\.gps-coordinate-display/);
  assert.match(app, /ReferenceDot/);
  assert.match(app, /You are here/);
  assert.match(app, /ProfilePoiDot/);
  assert.match(app, /profilePointsOfInterest/);
  assert.match(app, /profile-poi-label/);
  assert.match(app, /ElevationTooltip suppress=\{Boolean\(activeProfilePoi\)\}/);
  assert.match(app, /if \(suppress \|\| !active/);
  assert.doesNotMatch(app, /activeProfilePoi\.dayKm\.toFixed/);
  assert.match(app, /onMouseEnter=\{\(\) => onHover\(true\)\}/);
  assert.match(app, /onClick=\{onToggle\}/);
  assert.match(app, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(styles, /\.profile-poi-marker/);
  assert.match(styles, /\.profile-poi-label/);
  assert.match(app, /Previous walking day/);
  assert.match(app, /Next walking day/);
  assert.match(app, /dayIdForDate\(loadedDays, localDateKey\(\)\)/);
  assert.match(app, /id="plan-start-date"/);
  assert.match(app, /savePlanStartDate\(value\)/);
  assert.match(app, /DndContext/);
  assert.match(app, /SortableContext/);
  assert.match(app, /reorderWalkingDays/);
  assert.match(app, /Break day/);
  assert.match(app, /<Plus size=\{18\} \/> Add<\/button>/);
  assert.match(app, /<strong>Stage<\/strong>/);
  assert.match(app, /<strong>Point of interest<\/strong>/);
  assert.match(app, /<strong>Break day<\/strong>/);
  assert.match(app, /setBreakAfter/);
  assert.doesNotMatch(app, /aria-pressed=\{Boolean\(day\.breakAfter\)\}/);
  assert.doesNotMatch(app, /editor\.day\.date/);
  assert.match(app, /window\.setTimeout\(\(\) => setNotice\(""\), 4000\)/);
  assert.match(app, /window\.clearTimeout\(timeout\)/);
  assert.match(app, /withClientTimeout\(navigator\.serviceWorker\.register\("\/sw\.js"\), 8000\)/);
  assert.match(app, /handleOnline = \(\) => \{ setOnline\(true\); refreshOfflineState\(\); \}/);
  assert.match(app, /setOfflineState\(ready \? "ready" : "limited"\)/);
  assert.doesNotMatch(app, /current === "limited" \? "limited"/);
  assert.match(app, /controllerchange/);
  assert.match(app, /navigator\.serviceWorker\.controller \? "ready" : "limited"/);
  assert.match(app, /Start where the previous day ended/);
  assert.match(app, /<label>Start point<select/);
  assert.match(app, /<label>End point<select/);
  assert.doesNotMatch(app, /Start location name/);
  assert.doesNotMatch(app, /End location name/);
  assert.match(app, /No walking days planned/);
  assert.doesNotMatch(app, /Match to trail/);
  assert.doesNotMatch(app, /CoordinateMatcher/);
  assert.match(app, /nearestRoutePosition\(route, lng, lat\)/);
  assert.match(app, /Latitude<input inputMode="text" type="text"/);
  assert.match(app, /Longitude<input inputMode="text" type="text"/);
  assert.match(app, /placeholder="e\.g\. -5\.3167"/);
  assert.doesNotMatch(app, /inputMode="decimal" type="number"/);
  assert.match(app, /!latText \|\| !lngText/);
  assert.match(app, /Open \$\{selectedDay\.startName\} in OS Maps/);
  assert.match(app, /osMapsUrl\(startLocation\)/);
  assert.match(app, /osMapsUrl\(location\)/);
  assert.doesNotMatch(app, /Google Maps/);
  assert.doesNotMatch(app, /googleMapsUrl/);
  assert.doesNotMatch(app, /Verify start point in Google Maps/);
  assert.doesNotMatch(app, /Verify end point in Google Maps/);
  assert.match(app, /<h1>Locations<\/h1>/);
  assert.match(app, /label="Locations"/);
  assert.match(app, /tab === "locations"/);
  assert.doesNotMatch(app, /tab === "data"/);
  assert.doesNotMatch(app, /label="Route"/);
  assert.doesNotMatch(app, /Offline trail data/);
  assert.match(app, /Match and save/);
  assert.match(app, /daysUsingLocation\(days, location\.name\)/);
  assert.match(app, /Change those stages before deleting it/);
  assert.match(app, /is a planned point of interest/);
  assert.match(app, /pendingDayDeleteId/);
  assert.match(app, /pendingLocationDeleteName/);
  assert.match(app, /label="Delete stage\?"/);
  assert.match(app, /label="Delete location\?"/);
  assert.match(app, /inline-confirm-cancel/);
  assert.match(app, /inline-confirm-delete/);
  assert.match(styles, /\.inline-delete-confirm/);
  assert.match(app, /window\.confirm\(warning\)/);
  assert.match(app, /prepareRouteImport\(route, imported, days\)/);
  assert.match(app, /replaceRouteAndDays\(prepared\.route, prepared\.days\)/);
  assert.match(app, /GPX import cancelled\. Nothing was changed\./);
  assert.match(app, /Restore the bundled full South West Coast Path route\?/);
  assert.match(app, /Bundled-route restoration cancelled\. Nothing was changed\./);
  assert.doesNotMatch(app, /fetch\("\/data\/swcp-route\.json"\)/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(app, /Fine-tune start/);
  assert.doesNotMatch(app, /Fine-tune end/);
  assert.match(app, /AreaChart/);
  assert.match(app, /<h2>\{selectedDay\.startName\} <ArrowRight \/> \{selectedDay\.endName\}<\/h2>/);
  assert.match(app, /profile-day-line/);
  assert.match(app, /<time dateTime=\{selectedDay\.date \|\| undefined\}>\{formatDate\(selectedDay\.date\)\}<\/time>/);
  assert.doesNotMatch(app, /chart-note/);
  assert.doesNotMatch(app, /The bundled profile uses elevation/);
  assert.doesNotMatch(app, /<section className="hero-row">/);
  assert.doesNotMatch(app, /<Navigation size=\{14\} \/> Trail tracker/);
  assert.match(app, /profile-day-navigation/);
  assert.match(app, /<Mountain \/> \{highestPoint\.toLocaleString\(\)\} m/);
  assert.match(app, /distance-progress-card/);
  assert.match(app, /formatKm\(dayDistanceRemaining\)/);
  assert.match(app, /ascent-progress-card/);
  assert.match(app, /formatMetres\(dayAscentCompleted\).*<small>elapsed<\/small>/);
  assert.match(app, /\{dayAscentPercent\}%<\/strong>/);
  assert.match(app, /<span>Remaining<\/span><strong>\{formatMetres\(dayAscentRemaining\)\}/);
  assert.doesNotMatch(app, /dayAscentPercentLeft|<small>left<\/small>|% left<\/strong>/);
  assert.match(app, /next-poi-card/);
  assert.match(app, /nextPointOfInterest/);
  assert.match(app, /cleanPlannedPointsOfInterest/);
  assert.match(app, /Choose a location inside one of the planned stages/);
  assert.match(app, /itinerary-poi-row/);
  assert.match(app, /dayIdContainingDistance\(days, point\.distanceKm\) === day\.id/);
  assert.match(app, /km into Day/);
  assert.doesNotMatch(app, /planned-pois/);
  assert.match(app, /total-walk-card/);
  assert.match(app, /formatMetres\(planAscentRemaining\)/);
  assert.match(app, /plannedAscentM\(route, days, matched\?\.distanceKm\)/);
  assert.match(styles, /\.progress-pair/);
  assert.match(styles, /\.ascent-progress-card/);
  assert.doesNotMatch(styles, /\.ascent-progress-card \.progress-heading > strong \{[^}]*font-size/);
  assert.match(styles, /\.next-poi-card/);
  assert.match(styles, /\.itinerary-poi-row/);
  assert.match(styles, /\.total-walk-card/);
  assert.match(planning, /export function nextPointOfInterest/);
  assert.match(planning, /export function cleanPlannedPointsOfInterest/);
  assert.match(matching, /export function ascentBetween/);
  assert.match(matching, /export function plannedAscentM/);
  assert.doesNotMatch(app, /Use your iPhone location to calculate progress/);
  assert.doesNotMatch(app, /<Metric /);
  assert.doesNotMatch(app, /summary-stats/);
  assert.match(app, /Route data &amp; GPX/);
  assert.doesNotMatch(app, /CoastMap/);
  assert.match(app, /landscape-profile-ready/);
  assert.match(styles, /orientation: landscape/);
  assert.match(styles, /max-height: 500px/);
  assert.match(styles, /main-content > :not\(\.profile-card\)/);
  assert.match(styles, /height: 100dvh/);
  assert.match(planning, /totalPlannedDistanceKm/);
  assert.match(matching, /nearestRoutePosition/);
});

test("keeps one maintained route-data path and no obsolete map tooling", async () => {
  const [packageJson, lockfile, vite, types, database, styles, app, readme, architecture, generator] = await Promise.all([
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
    readFile(new URL("package-lock.json", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("app/types.ts", root), "utf8"),
    readFile(new URL("app/lib/db.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/components/CoastPathApp.tsx", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("docs/ARCHITECTURE.md", root), "utf8"),
    readFile(new URL("scripts/build-full-route.mjs", root), "utf8"),
  ]);

  assert.match(packageJson.scripts["route:data"], /build-full-route/);
  assert.equal(packageJson.devDependencies.osmtogeojson, undefined);
  assert.doesNotMatch(lockfile, /osmtogeojson/);
  assert.doesNotMatch(vite, /maplibre/i);
  assert.doesNotMatch(types, /completedDistanceKm/);
  assert.doesNotMatch(database, /export async function replaceRoute\(/);
  assert.doesNotMatch(styles, /\.hero-row/);
  assert.doesNotMatch(app, /locations-workspace|simulation-card/);
  assert.equal(packageJson.scripts["route:segment"], undefined);
  assert.match(readme, /single supported route-generation path/);
  assert.match(architecture, /only maintained route-generation script/);
  assert.match(generator, /Part \$\{index \+ 1\}/);
  assert.match(generator, /No.*Stop.*Latitude.*Longitude/s);
  assert.match(generator, /sourceOrderChanges/);
  await assert.rejects(access(new URL("app/chatgpt-auth.ts", root)));
  await assert.rejects(access(new URL("scripts/build-route-data.mjs", root)));
  await assert.rejects(access(new URL("scripts/extract-gpx-segment.mjs", root)));
});
