import Dexie, { type EntityTable } from "dexie";
import type { Checkpoint, PlannedPointOfInterest, TrailRoute, WalkingDay } from "../types";
import bundledRouteData from "../data/swcp-route.json";
import { normalizeDayOrders } from "./days";
import { fillWalkingDayDates } from "./planning";
import { migrateCheckpointsToRoute, migrateDaysToRoute } from "./route";

type StoredRoute = { key: string; data: TrailRoute };
type StoredSetting = { key: string; value: string };

class CoastPathDatabase extends Dexie {
  routes!: EntityTable<StoredRoute, "key">;
  days!: EntityTable<WalkingDay, "id">;
  pointsOfInterest!: EntityTable<PlannedPointOfInterest, "id">;
  settings!: EntityTable<StoredSetting, "key">;

  constructor() {
    super("coastline-swcp");
    this.version(1).stores({
      routes: "key",
      days: "id, order",
      settings: "key",
    });
    this.version(2).stores({
      routes: "key",
      days: "id, order",
      pointsOfInterest: "id, locationName",
      settings: "key",
    });
  }
}

export const db = new CoastPathDatabase();

const bundledRoute = bundledRouteData as unknown as TrailRoute;

export function getBundledRoute(): TrailRoute {
  return bundledRoute;
}

function fallbackId() {
  return globalThis.crypto?.randomUUID?.() ?? `day-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDays(route: TrailRoute): WalkingDay[] {
  const defaults = [[route.checkpoints[0].name, route.checkpoints[1]?.name ?? route.checkpoints.at(-1)!.name]];
  return defaults.map(([startName, endName], index) => {
    const start = route.checkpoints.find((point) => point.name === startName)!;
    const end = route.checkpoints.find((point) => point.name === endName)!;
    return {
      id: fallbackId(), order: index + 1, date: "", startName, endName,
      startDistanceKm: start.distanceKm, endDistanceKm: end.distanceKm,
    };
  });
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 1800): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Local storage timed out")), timeoutMs)),
  ]);
}

export async function loadInitialData(): Promise<{ route: TrailRoute; days: WalkingDay[]; pointsOfInterest: PlannedPointOfInterest[]; planStartDate: string; storageReady: boolean }> {
  let route = bundledRoute;
  let previousBundledRoute: TrailRoute | null = null;
  let storageReady = true;
  try {
    const storedRoute = (await withTimeout(db.routes.get("active")))?.data;
    const previousBundledIds = new Set([
      "swcp-gpx-penzance-falmouth-2026-04",
      "swcp-gpx-mousehole-falmouth-2026-04",
      "swcp-gpx-lands-end-falmouth-2026-04",
    ]);
    const isPreviousBundledRoute = storedRoute && storedRoute.id !== bundledRoute.id
      && (storedRoute.id.startsWith("swcp-osm-") || previousBundledIds.has(storedRoute.id));
    if (isPreviousBundledRoute) {
      previousBundledRoute = storedRoute;
      const checkpointsByName = new Map(bundledRoute.checkpoints.map((checkpoint) => [checkpoint.name.toLowerCase(), checkpoint]));
      for (const checkpoint of migrateCheckpointsToRoute(storedRoute.checkpoints, bundledRoute)) {
        if (!checkpointsByName.has(checkpoint.name.toLowerCase())) checkpointsByName.set(checkpoint.name.toLowerCase(), checkpoint);
      }
      route = { ...bundledRoute, checkpoints: [...checkpointsByName.values()].sort((a, b) => a.distanceKm - b.distanceKm) };
    } else {
      route = storedRoute ?? bundledRoute;
    }
  } catch {
    storageReady = false;
  }

  let days: WalkingDay[] = [];
  try {
    days = await withTimeout(db.days.orderBy("order").toArray());
  } catch {
    storageReady = false;
  }
  if (previousBundledRoute && days.length) days = migrateDaysToRoute(days, previousBundledRoute, route);
  if (!days.length) days = defaultDays(route);
  days = normalizeDayOrders(days);

  let planStartDate = days[0]?.date ?? "";
  try {
    planStartDate = (await withTimeout(db.settings.get("plan-start-date")))?.value ?? planStartDate;
  } catch {
    storageReady = false;
  }
  days = fillWalkingDayDates(days, planStartDate);

  let pointsOfInterest: PlannedPointOfInterest[] = [];
  try {
    const storedPoints = await withTimeout(db.pointsOfInterest.toArray());
    const availableNames = new Set(route.checkpoints.map((point) => point.name));
    const seenNames = new Set<string>();
    pointsOfInterest = storedPoints.filter((point) => {
      if (!availableNames.has(point.locationName) || seenNames.has(point.locationName)) return false;
      seenNames.add(point.locationName);
      return true;
    });
    if (pointsOfInterest.length !== storedPoints.length) {
      db.transaction("rw", db.pointsOfInterest, async () => {
        await db.pointsOfInterest.clear();
        if (pointsOfInterest.length) await db.pointsOfInterest.bulkPut(pointsOfInterest);
      }).catch(() => undefined);
    }
  } catch {
    storageReady = false;
  }

  // The route is compiled into the app, so startup never depends on a network
  // request. Refresh IndexedDB in the background without blocking the UI.
  if (route.id === bundledRoute.id) db.routes.put({ key: "active", data: route }).catch(() => undefined);
  db.transaction("rw", db.days, async () => {
    await db.days.clear();
    if (days.length) await db.days.bulkPut(days);
  }).catch(() => undefined);

  return { route, days, pointsOfInterest, planStartDate, storageReady };
}

export async function savePlanStartDate(value: string) {
  if (value) await db.settings.put({ key: "plan-start-date", value });
  else await db.settings.delete("plan-start-date");
}

export async function replaceRouteAndDays(route: TrailRoute, days: WalkingDay[]) {
  await db.transaction("rw", db.routes, db.days, async () => {
    await db.routes.put({ key: "active", data: route });
    await db.days.clear();
    if (days.length) await db.days.bulkPut(days);
  });
}

export async function saveRouteCheckpoints(route: TrailRoute, checkpoints: Checkpoint[]): Promise<TrailRoute> {
  const updated = { ...route, checkpoints: [...checkpoints].sort((a, b) => a.distanceKm - b.distanceKm) };
  await db.routes.put({ key: "active", data: updated });
  return updated;
}
