import { gpx } from "@tmcw/togeojson";
import type { Checkpoint, GpsReading, MatchedPosition, RoutePoint, TrailRoute, WalkingDay } from "../types";

export const haversineKm = (a: Pick<RoutePoint, "lng" | "lat">, b: Pick<RoutePoint, "lng" | "lat">) => {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export function pointsForDay(route: TrailRoute, start: number, end: number) {
  return route.points.filter((point): point is RoutePoint => Boolean(point && point.distanceKm >= start && point.distanceKm <= end));
}

export function nearestRoutePosition(route: TrailRoute, lng: number, lat: number): MatchedPosition | null {
  let best: MatchedPosition | null = null;
  let previous: RoutePoint | null = null;
  const cosLat = Math.cos(lat * Math.PI / 180);
  for (const point of route.points) {
    if (!point) { previous = null; continue; }
    if (previous) {
      const ax = previous.lng * cosLat; const ay = previous.lat;
      const bx = point.lng * cosLat; const by = point.lat;
      const px = lng * cosLat; const py = lat;
      const dx = bx - ax; const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const projectedLng = (ax + t * dx) / cosLat;
      const projectedLat = ay + t * dy;
      const offRouteM = haversineKm({ lng, lat }, { lng: projectedLng, lat: projectedLat }) * 1000;
      if (!best || offRouteM < best.offRouteM) {
        best = {
          lng: projectedLng,
          lat: projectedLat,
          distanceKm: previous.distanceKm + t * (point.distanceKm - previous.distanceKm),
          offRouteM,
        };
      }
    }
    previous = point;
  }
  return best;
}

export function routePointAt(route: TrailRoute, distanceKm: number): RoutePoint | null {
  let previous: RoutePoint | null = null;
  for (const point of route.points) {
    if (!point) { previous = null; continue; }
    if (previous && point.distanceKm >= distanceKm) {
      const span = point.distanceKm - previous.distanceKm;
      const t = span ? (distanceKm - previous.distanceKm) / span : 0;
      return {
        lng: previous.lng + t * (point.lng - previous.lng),
        lat: previous.lat + t * (point.lat - previous.lat),
        elevationM: Math.round(previous.elevationM + t * (point.elevationM - previous.elevationM)),
        distanceKm,
      };
    }
    previous = point;
  }
  return previous;
}

export function simulatedGpsNearCheckpoint(route: TrailRoute, checkpointName = "The Lizard", offsetKm = 3): GpsReading | null {
  const checkpoint = route.checkpoints.find((point) => point.name === checkpointName)
    ?? route.checkpoints.find((point) => point.name === "Lizard Point")
    ?? route.checkpoints[0];
  if (!checkpoint) return null;
  const point = routePointAt(route, Math.min(route.officialDistanceKm, checkpoint.distanceKm + offsetKm));
  if (!point) return null;
  return {
    latitude: point.lat,
    longitude: point.lng,
    accuracy: 6,
    altitude: point.elevationM,
    altitudeAccuracy: 10,
    heading: 90,
    speed: 1.35,
  };
}

export function osMapsUrl(point: Pick<RoutePoint, "lat" | "lng">): string {
  const query = new URLSearchParams({
    lat: point.lat.toFixed(6),
    lon: point.lng.toFixed(6),
    zoom: "13.0000",
    style: "Leisure",
    type: "2d",
  });
  return `https://explore.osmaps.com/?${query.toString()}`;
}

export function migrateDaysToRoute(days: WalkingDay[], sourceRoute: TrailRoute, targetRoute: TrailRoute, maximumOffsetM = 5000): WalkingDay[] {
  return days.flatMap((day) => {
    const sourceStart = day.startCoordinate ?? routePointAt(sourceRoute, day.startDistanceKm);
    const sourceEnd = day.endCoordinate ?? routePointAt(sourceRoute, day.endDistanceKm);
    if (!sourceStart || !sourceEnd) return [];
    const start = nearestRoutePosition(targetRoute, sourceStart.lng, sourceStart.lat);
    const end = nearestRoutePosition(targetRoute, sourceEnd.lng, sourceEnd.lat);
    if (!start || !end || start.offRouteM > maximumOffsetM || end.offRouteM > maximumOffsetM || end.distanceKm <= start.distanceKm) return [];
    return [{ ...day, startDistanceKm: start.distanceKm, endDistanceKm: end.distanceKm, startCoordinate: undefined, endCoordinate: undefined }];
  });
}

export function migrateCheckpointsToRoute(checkpoints: Checkpoint[], targetRoute: TrailRoute, maximumOffsetM = 5000): Checkpoint[] {
  return checkpoints.flatMap((checkpoint) => {
    const match = nearestRoutePosition(targetRoute, checkpoint.lng, checkpoint.lat);
    if (!match || match.offRouteM > maximumOffsetM) return [];
    return [{ name: checkpoint.name, lng: match.lng, lat: match.lat, distanceKm: match.distanceKm }];
  }).sort((a, b) => a.distanceKm - b.distanceKm);
}

export function prepareRouteImport(sourceRoute: TrailRoute, targetRoute: TrailRoute, days: WalkingDay[], maximumOffsetM = 5000) {
  const migratedCheckpoints = migrateCheckpointsToRoute(sourceRoute.checkpoints, targetRoute, maximumOffsetM);
  const checkpoints = [...migratedCheckpoints];
  const names = new Set(checkpoints.map((point) => point.name.toLowerCase()));
  for (const endpoint of targetRoute.checkpoints) {
    const alreadyRepresented = checkpoints.some((point) => Math.abs(point.distanceKm - endpoint.distanceKm) <= 0.05);
    if (!alreadyRepresented && !names.has(endpoint.name.toLowerCase())) {
      checkpoints.push(endpoint);
      names.add(endpoint.name.toLowerCase());
    }
  }
  checkpoints.sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    route: { ...targetRoute, checkpoints },
    days: migrateDaysToRoute(days, sourceRoute, targetRoute, maximumOffsetM),
    matchedLocationCount: migratedCheckpoints.length,
  };
}

export function ascentDescent(points: RoutePoint[]) {
  let ascent = 0; let descent = 0;
  for (let index = 1; index < points.length; index += 1) {
    const change = points[index].elevationM - points[index - 1].elevationM;
    if (change > 0) ascent += change; else descent -= change;
  }
  return { ascent: Math.round(ascent), descent: Math.round(descent) };
}

export function ascentBetween(route: TrailRoute, startDistanceKm: number, endDistanceKm: number): number {
  if (endDistanceKm <= startDistanceKm) return 0;
  let ascent = 0;
  let previous: RoutePoint | null = null;
  for (const point of route.points) {
    if (!point) { previous = null; continue; }
    if (previous) {
      const segmentStart = Math.max(startDistanceKm, previous.distanceKm);
      const segmentEnd = Math.min(endDistanceKm, point.distanceKm);
      const segmentDistance = point.distanceKm - previous.distanceKm;
      if (segmentEnd > segmentStart && segmentDistance > 0) {
        const elevationChange = (point.elevationM - previous.elevationM)
          * ((segmentEnd - segmentStart) / segmentDistance);
        if (elevationChange > 0) ascent += elevationChange;
      }
    }
    previous = point;
  }
  return ascent;
}

export function plannedAscentM(route: TrailRoute, days: WalkingDay[], currentDistanceKm?: number): number {
  return days.reduce((total, day) => total + ascentBetween(
    route,
    currentDistanceKm === undefined ? day.startDistanceKm : Math.max(day.startDistanceKm, currentDistanceKm),
    day.endDistanceKm,
  ), 0);
}

export function importGpx(text: string, filename: string): TrailRoute {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This does not appear to be a valid GPX file.");
  const collection = gpx(document);
  const features = collection.features as Array<{ geometry: { type: string; coordinates: unknown } }>;
  const geometries = features.flatMap((feature): number[][][] => {
    if (feature.geometry.type === "LineString") return [feature.geometry.coordinates as number[][]];
    if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates as number[][][];
    return [];
  });
  if (!geometries.length) throw new Error("No track or route was found in that GPX file.");

  let cumulative = 0;
  let previous: RoutePoint | null = null;
  const points: Array<RoutePoint | null> = [];
  for (const geometry of geometries) {
    previous = null;
    for (const coordinate of geometry) {
      const point: RoutePoint = {
        lng: coordinate[0], lat: coordinate[1], elevationM: Math.round(coordinate[2] ?? 0), distanceKm: cumulative,
      };
      if (previous) cumulative += haversineKm(previous, point);
      point.distanceKm = Number(cumulative.toFixed(3));
      points.push(point);
      previous = point;
    }
    points.push(null);
  }
  points.pop();
  const first = points.find(Boolean) as RoutePoint;
  const last = [...points].reverse().find(Boolean) as RoutePoint;
  const checkpoints: Checkpoint[] = [
    { name: "Route start", lng: first.lng, lat: first.lat, distanceKm: 0 },
    { name: "Route end", lng: last.lng, lat: last.lat, distanceKm: cumulative },
  ];
  return {
    id: `gpx-${Date.now()}`,
    name: filename.replace(/\.gpx$/i, ""),
    officialDistanceKm: Number(cumulative.toFixed(1)),
    generatedAt: new Date().toISOString(),
    elevationSource: "Imported GPX",
    geometrySource: filename,
    points,
    checkpoints,
  };
}
