import fs from "node:fs";

const input = process.argv[2];
const output = process.argv[3] ?? "public/data/swcp-route.json";

if (!input) throw new Error("Usage: npm run route:segment -- source.gpx [output.json]");

// Place coordinates resolved from OpenStreetMap/Nominatim, then snapped to the GPX below.
const startSeed = { name: "Mousehole", lat: 50.0839943, lng: -5.5389614 };
const penzanceSeed = { name: "Penzance", lat: 50.1194794, lng: -5.5352463 };
const endSeed = { name: "Falmouth", lat: 50.1552197, lng: -5.0688262 };
const checkpointSeeds = [
  startSeed,
  penzanceSeed,
  { name: "Porthleven", lat: 50.0849174, lng: -5.3166558 },
  { name: "Lizard Point", lat: 49.9588849, lng: -5.2063788 },
  { name: "Coverack", lat: 50.0224895, lng: -5.0971985 },
  { name: "Helford", lat: 50.0931362, lng: -5.1369699 },
  endSeed,
];

const toRad = (value) => value * Math.PI / 180;
const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const xml = fs.readFileSync(input, "utf8");
const wantedNames = new Set(["South West Coast Path Part 2", "South West Coast Path Part 3"]);
const seenNames = new Set();
const tracks = [];

for (const match of xml.matchAll(/<trk>([\s\S]*?)<\/trk>/g)) {
  const body = match[1];
  const name = body.match(/<name>(.*?)<\/name>/)?.[1];
  if (!name || !wantedNames.has(name) || seenNames.has(name)) continue;
  seenNames.add(name);
  const raw = [...body.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">\s*<ele>([^<]+)<\/ele>/g)]
    .map((point) => ({ lat: Number(point[1]), lng: Number(point[2]), elevationM: Number(point[3]) }));
  const points = raw.filter((point, index) => !index
    || point.lat !== raw[index - 1].lat
    || point.lng !== raw[index - 1].lng
    || point.elevationM !== raw[index - 1].elevationM);
  tracks.push({ name, points });
}

if (tracks.length !== wantedNames.size) throw new Error("Could not find the required Part 2 and Part 3 tracks.");

const indexed = tracks.flatMap((track, trackIndex) => track.points.map((point, pointIndex) => ({ point, trackIndex, pointIndex })));
const nearest = (seed) => indexed.reduce((best, candidate) => {
  const distance = distanceKm(seed, candidate.point);
  return distance < best.distance ? { ...candidate, distance } : best;
}, { distance: Infinity });

const start = nearest(startSeed);
const end = nearest(endSeed);
if (start.trackIndex > end.trackIndex || (start.trackIndex === end.trackIndex && start.pointIndex >= end.pointIndex)) {
  throw new Error("The requested segment is not ordered from Mousehole to Falmouth in this GPX.");
}
if (start.distance > 0.5 || end.distance > 0.5) throw new Error("The GPX does not pass close enough to Mousehole and Falmouth.");

const selectedTracks = tracks
  .slice(start.trackIndex, end.trackIndex + 1)
  .map((track, relativeIndex) => {
    const from = relativeIndex === 0 ? start.pointIndex : 0;
    const to = relativeIndex === end.trackIndex - start.trackIndex ? end.pointIndex + 1 : track.points.length;
    return track.points.slice(from, to);
  })
  .filter((points) => points.length);

let cumulative = 0;
const routePoints = [];
for (const [trackIndex, points] of selectedTracks.entries()) {
  if (trackIndex) routePoints.push(null);
  let previous = null;
  for (const point of points) {
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

const usablePoints = routePoints.filter(Boolean);
const checkpoints = checkpointSeeds.map((seed) => {
  const point = usablePoints.reduce((best, candidate) => distanceKm(seed, candidate) < distanceKm(seed, best) ? candidate : best);
  return { name: seed.name, lng: point.lng, lat: point.lat, distanceKm: point.distanceKm };
}).sort((a, b) => a.distanceKm - b.distanceKm);

const route = {
  id: "swcp-gpx-mousehole-falmouth-2026-04",
  name: "South West Coast Path: Mousehole to Falmouth",
  officialDistanceKm: Number(cumulative.toFixed(1)),
  generatedAt: new Date().toISOString(),
  elevationSource: "Supplied GPX elevation (GPS Visualizer)",
  geometrySource: "Supplied South West Coast Path GPX, Mousehole to Falmouth",
  points: routePoints,
  checkpoints,
};

fs.writeFileSync(output, `${JSON.stringify(route)}\n`);
console.log(JSON.stringify({
  output,
  distanceKm: route.officialDistanceKm,
  points: usablePoints.length,
  startOffsetM: Math.round(start.distance * 1000),
  endOffsetM: Math.round(end.distance * 1000),
  elevationMinimumM: Math.min(...usablePoints.map((point) => point.elevationM)),
  elevationMaximumM: Math.max(...usablePoints.map((point) => point.elevationM)),
}, null, 2));
