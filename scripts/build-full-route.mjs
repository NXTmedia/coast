import fs from "node:fs";

const input = process.argv[2];
const stopsInput = process.argv[3];
const output = process.argv[4] ?? "app/data/swcp-route.json";

if (!input || !stopsInput) {
  throw new Error("Usage: npm run route:data -- source.gpx itinerary-stops.csv [output.json]");
}

const toRad = (value) => value * Math.PI / 180;
const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { cells.push(value); value = ""; }
    else value += character;
  }
  cells.push(value);
  return cells;
}

const stopLines = fs.readFileSync(stopsInput, "utf8").trim().split(/\r?\n/);
const header = parseCsvLine(stopLines.shift()).map((value) => value.trim().toLowerCase());
const columns = {
  number: header.indexOf("no"),
  name: header.indexOf("stop"),
  lat: header.indexOf("latitude"),
  lng: header.indexOf("longitude"),
};
if (Object.values(columns).some((index) => index < 0)) throw new Error("The stops CSV must contain No, Stop, Latitude and Longitude columns.");

const checkpointSeeds = stopLines.map((line) => {
  const cells = parseCsvLine(line);
  return {
    number: Number(cells[columns.number]),
    name: cells[columns.name]?.trim(),
    lat: Number(cells[columns.lat]),
    lng: Number(cells[columns.lng]),
  };
});
if (!checkpointSeeds.length || checkpointSeeds.some((seed) => !seed.name || !Number.isFinite(seed.number)
  || !Number.isFinite(seed.lat) || !Number.isFinite(seed.lng))) {
  throw new Error("The stops CSV contains a missing or invalid stop value.");
}
if (new Set(checkpointSeeds.map((seed) => seed.name.toLowerCase())).size !== checkpointSeeds.length) {
  throw new Error("Every stop name in the CSV must be unique.");
}

const xml = fs.readFileSync(input, "utf8");
const wantedNames = Array.from({ length: 11 }, (_, index) => `South West Coast Path Part ${index + 1}`);
const wantedNameSet = new Set(wantedNames);
const seenNames = new Set();
const tracksByName = new Map();

for (const match of xml.matchAll(/<trk>([\s\S]*?)<\/trk>/g)) {
  const body = match[1];
  const name = body.match(/<name>(.*?)<\/name>/)?.[1];
  if (!name || !wantedNameSet.has(name) || seenNames.has(name)) continue;
  seenNames.add(name);
  const raw = [...body.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">\s*<ele>([^<]+)<\/ele>/g)]
    .map((point) => ({ lat: Number(point[1]), lng: Number(point[2]), elevationM: Number(point[3]) }));
  const points = raw.filter((point, index) => !index
    || point.lat !== raw[index - 1].lat
    || point.lng !== raw[index - 1].lng
    || point.elevationM !== raw[index - 1].elevationM);
  tracksByName.set(name, points);
}

if (tracksByName.size !== wantedNames.length) {
  throw new Error(`Expected the first copy of all 11 main path parts, found ${tracksByName.size}.`);
}

let cumulative = 0;
const routePoints = [];
for (const [trackIndex, name] of wantedNames.entries()) {
  if (trackIndex) routePoints.push(null);
  let previous = null;
  for (const point of tracksByName.get(name)) {
    if (previous) cumulative += distanceKm(previous, point);
    routePoints.push({
      lng: Number(point.lng.toFixed(6)),
      lat: Number(point.lat.toFixed(6)),
      elevationM: Number(point.elevationM.toFixed(1)),
      distanceKm: Number(cumulative.toFixed(3)),
    });
    previous = point;
  }
}

function nearestRoutePosition(seed) {
  let best = null;
  let previous = null;
  const cosLat = Math.cos(toRad(seed.lat));
  for (const point of routePoints) {
    if (!point) { previous = null; continue; }
    if (previous) {
      const ax = previous.lng * cosLat; const ay = previous.lat;
      const bx = point.lng * cosLat; const by = point.lat;
      const px = seed.lng * cosLat; const py = seed.lat;
      const dx = bx - ax; const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const lng = (ax + t * dx) / cosLat;
      const lat = ay + t * dy;
      const offsetKm = distanceKm(seed, { lng, lat });
      if (!best || offsetKm < best.offsetKm) {
        best = {
          lng: Number(lng.toFixed(6)),
          lat: Number(lat.toFixed(6)),
          distanceKm: Number((previous.distanceKm + t * (point.distanceKm - previous.distanceKm)).toFixed(3)),
          offsetKm,
        };
      }
    }
    previous = point;
  }
  return best;
}

const checkpointMatches = checkpointSeeds.map((seed) => ({ seed, match: nearestRoutePosition(seed) }));
const maximumOffsetKm = Math.max(...checkpointMatches.map(({ match }) => match.offsetKm));
if (maximumOffsetKm > 10) throw new Error(`A CSV stop is more than 10 km from the main path (${maximumOffsetKm.toFixed(1)} km).`);

const sourceOrderChanges = checkpointMatches.filter(({ match }, index) => index > 0
  && match.distanceKm < checkpointMatches[index - 1].match.distanceKm).length;
const checkpoints = checkpointMatches
  .map(({ seed, match }) => ({ name: seed.name, lng: match.lng, lat: match.lat, distanceKm: match.distanceKm }))
  .sort((a, b) => a.distanceKm - b.distanceKm);

const usablePoints = routePoints.filter(Boolean);
const route = {
  id: "swcp-gpx-full-mainline-2026-04",
  name: "South West Coast Path: Minehead to South Haven Point",
  officialDistanceKm: Number(cumulative.toFixed(1)),
  generatedAt: new Date().toISOString(),
  elevationSource: "Supplied GPX elevation (GPS Visualizer)",
  geometrySource: "Supplied South West Coast Path GPX, complete main path Parts 1–11",
  points: routePoints,
  checkpoints,
};

fs.writeFileSync(output, `${JSON.stringify(route)}\n`);
console.log(JSON.stringify({
  output,
  distanceKm: route.officialDistanceKm,
  points: usablePoints.length,
  trackParts: wantedNames.length,
  trackBreaks: routePoints.filter((point) => point === null).length,
  stops: checkpoints.length,
  maximumStopOffsetM: Math.round(maximumOffsetKm * 1000),
  sourceOrderChanges,
  elevationMinimumM: Math.min(...usablePoints.map((point) => point.elevationM)),
  elevationMaximumM: Math.max(...usablePoints.map((point) => point.elevationM)),
}, null, 2));
