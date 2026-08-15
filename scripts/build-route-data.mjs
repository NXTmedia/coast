import fs from "node:fs";
import path from "node:path";
import osmtogeojson from "osmtogeojson";

const input = process.argv[2] ?? "work/swcp-full-osm.json";
const output = process.argv[3] ?? "public/data/swcp-route.json";
const withElevation = process.argv.includes("--elevation");

const osm = JSON.parse(fs.readFileSync(input, "utf8"));
const geo = osmtogeojson(osm);
const sections = geo.features
  .map((feature) => {
    const match = feature.properties?.name?.match(/Section\s+(\d+)/i);
    if (!match || feature.properties?.ref !== "SWCP") return null;
    const parts = feature.geometry.type === "LineString"
      ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiLineString"
        ? feature.geometry.coordinates
        : [];
    return { number: Number(match[1]), parts };
  })
  .filter(Boolean)
  .sort((a, b) => a.number - b.number);

const distanceKm = (a, b) => {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const nearestEndpoint = (part, current) => {
  const first = distanceKm(current, part[0]);
  const last = distanceKm(current, part[part.length - 1]);
  return first <= last ? { distance: first, reversed: false } : { distance: last, reversed: true };
};

let current = [-3.4748, 51.2057];
const assembled = [];
for (const section of sections) {
  const remaining = [...section.parts].filter((part) => part.length > 1);
  while (remaining.length) {
    let bestIndex = 0;
    let best = nearestEndpoint(remaining[0], current);
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = nearestEndpoint(remaining[index], current);
      if (candidate.distance < best.distance) {
        bestIndex = index;
        best = candidate;
      }
    }
    const [selected] = remaining.splice(bestIndex, 1);
    const oriented = best.reversed ? [...selected].reverse() : selected;
    // Do not draw a misleading straight line across disconnected ferry/variant gaps.
    if (assembled.length && best.distance > 2.5) assembled.push(null);
    for (const point of oriented) assembled.push([point[0], point[1]]);
    current = oriented[oriented.length - 1];
  }
}

const pointSegmentDistance = (point, start, end) => {
  const x = point[0]; const y = point[1];
  const dx = end[0] - start[0]; const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(x - start[0], y - start[1]);
  const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (y - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (start[0] + t * dx), y - (start[1] + t * dy));
};

const simplify = (points, tolerance) => {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let split = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const d = pointSegmentDistance(points[index], points[0], points[points.length - 1]);
    if (d > maxDistance) { maxDistance = d; split = index; }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(split), tolerance),
  ];
};

const simplified = [];
let block = [];
for (const point of assembled) {
  if (point) block.push(point);
  else if (block.length) {
    simplified.push(...simplify(block, 0.00028), null);
    block = [];
  }
}
if (block.length) simplified.push(...simplify(block, 0.00028));
if (simplified.at(-1) === null) simplified.pop();

const coordinatePoints = simplified.filter(Boolean);
let elevationSource = "Illustrative elevation model";
let elevations = coordinatePoints.map((_, index) => {
  // Deterministic fallback keeps the bundled demo usable if the elevation API is unavailable.
  const rolling = 72 + 58 * Math.sin(index * 0.23) + 36 * Math.sin(index * 0.061 + 1.7);
  return Math.max(2, Math.round(rolling));
});

if (withElevation) {
  try {
    const fetched = [];
    for (let index = 0; index < coordinatePoints.length; index += 100) {
      const batch = coordinatePoints.slice(index, index + 100);
      const latitude = batch.map((point) => point[1]).join(",");
      const longitude = batch.map((point) => point[0]).join(",");
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Elevation request failed (${response.status})`);
      const data = await response.json();
      fetched.push(...data.elevation);
    }
    if (fetched.length === coordinatePoints.length) {
      elevations = fetched;
      elevationSource = "Open-Meteo Elevation API (90 m DEM)";
    }
  } catch (error) {
    console.warn(`Using illustrative elevation fallback: ${error.message}`);
  }
}

let pointIndex = 0;
let cumulativeKm = 0;
let previous = null;
const points = simplified.map((coordinate) => {
  if (!coordinate) { previous = null; return null; }
  if (previous) cumulativeKm += distanceKm(previous, coordinate);
  const point = {
    lng: Number(coordinate[0].toFixed(6)),
    lat: Number(coordinate[1].toFixed(6)),
    elevationM: Math.round(elevations[pointIndex] ?? 0),
    distanceKm: Number(cumulativeKm.toFixed(3)),
  };
  pointIndex += 1;
  previous = coordinate;
  return point;
});

const checkpointSeeds = [
  ["Minehead", -3.4748, 51.2057], ["Porlock Weir", -3.6289, 51.2187],
  ["Lynmouth", -3.8312, 51.2312], ["Combe Martin", -4.0393, 51.2056],
  ["Woolacombe", -4.2071, 51.1727], ["Braunton", -4.1613, 51.1088],
  ["Instow", -4.1792, 51.0524], ["Westward Ho!", -4.2385, 51.0392],
  ["Clovelly", -4.3999, 50.9990], ["Hartland Quay", -4.5330, 50.9944],
  ["Bude", -4.5469, 50.8310], ["Tintagel", -4.7530, 50.6631],
  ["Padstow", -4.9365, 50.5419], ["Newquay", -5.0757, 50.4155],
  ["St Ives", -5.4781, 50.2148], ["Land's End", -5.7160, 50.0680],
  ["Penzance", -5.5372, 50.1188], ["Lizard Point", -5.2061, 49.9593],
  ["Falmouth", -5.0645, 50.1526], ["Plymouth", -4.1427, 50.3657],
  ["Dartmouth", -3.5788, 50.3515], ["Torquay", -3.5253, 50.4619],
  ["Exmouth", -3.4130, 50.6175], ["Lyme Regis", -2.9343, 50.7252],
  ["West Bay", -2.7647, 50.7107], ["Weymouth", -2.4540, 50.6088],
  ["Swanage", -1.9586, 50.6098], ["South Haven Point", -1.9490, 50.6814],
];

const usablePoints = points.filter(Boolean);
const checkpoints = checkpointSeeds.map(([name, lng, lat]) => {
  let best = usablePoints[0]; let bestDistance = Infinity;
  for (const point of usablePoints) {
    const d = distanceKm([lng, lat], [point.lng, point.lat]);
    if (d < bestDistance) { best = point; bestDistance = d; }
  }
  return { name, lng: best.lng, lat: best.lat, distanceKm: best.distanceKm };
}).sort((a, b) => a.distanceKm - b.distanceKm);

const data = {
  id: "swcp-osm-2026-07",
  name: "South West Coast Path",
  officialDistanceKm: 1013,
  generatedAt: new Date().toISOString(),
  elevationSource,
  geometrySource: "OpenStreetMap relation 2376086, ODbL",
  points,
  checkpoints,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(data));
console.log(`Wrote ${usablePoints.length} route points (${cumulativeKm.toFixed(1)} km) to ${output}`);
