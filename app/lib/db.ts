import Dexie, { type EntityTable } from "dexie";
import type { Checkpoint, TrailRoute, WalkingDay } from "../types";
import bundledRouteData from "../data/swcp-route.json";
import { normalizeDayOrders, removeLegacyStarterDays } from "./days";
import { fillWalkingDayDates } from "./planning";
import { migrateCheckpointsToRoute, migrateDaysToRoute } from "./route";

type StoredRoute = { key: string; data: TrailRoute };
type StoredSetting = { key: string; value: string };

class CoastPathDatabase extends Dexie {
  routes!: EntityTable<StoredRoute, "key">;
  days!: EntityTable<WalkingDay, "id">;
  settings!: EntityTable<StoredSetting, "key">;

  constructor() {
    super("coastline-swcp");
    this.version(1).stores({
      routes: "key",
      days: "id, order",
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
  const hasBundledStops = route.checkpoints.some((point) => point.name === "Porlock Weir");
  const defaults = hasBundledStops
    ? [["Minehead", "Porlock Weir"], ["Porlock Weir", "Lynmouth"], ["Lynmouth", "Combe Martin"]]
    : [[route.checkpoints[0].name, route.checkpoints.at(-1)!.name]];
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

export async function loadInitialData(): Promise<{ route: TrailRoute; days: WalkingDay[]; planStartDate: string; storageReady: boolean }> {
  let route = bundledRoute;
  let previousBundledRoute: TrailRoute | null = null;
  let storageReady = true;
  try {
    const storedRoute = (await withTimeout(db.routes.get("active")))?.data;
    const isPreviousBundledRoute = storedRoute && storedRoute.id !== bundledRoute.id
      && (storedRoute.id.startsWith("swcp-osm-") || storedRoute.id === "swcp-gpx-penzance-falmouth-2026-04");
    if (isPreviousBundledRoute) {
      previousBundledRoute = storedRoute;
      if (storedRoute.id === "swcp-gpx-penzance-falmouth-2026-04") {
        const migrated = migrateCheckpointsToRoute(storedRoute.checkpoints, bundledRoute);
        const mousehole = bundledRoute.checkpoints.find((checkpoint) => checkpoint.name === "Mousehole");
        route = { ...bundledRoute, checkpoints: [mousehole, ...migrated].filter(Boolean) as Checkpoint[] };
      } else {
        route = bundledRoute;
      }
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
  if (route.id === bundledRoute.id) days = removeLegacyStarterDays(days);
  if (!days.length) days = defaultDays(route);
  days = normalizeDayOrders(days);

  let planStartDate = days[0]?.date ?? "";
  try {
    planStartDate = (await withTimeout(db.settings.get("plan-start-date")))?.value ?? planStartDate;
  } catch {
    storageReady = false;
  }
  days = fillWalkingDayDates(days, planStartDate);

  // The route is compiled into the app, so startup never depends on a network
  // request. Refresh IndexedDB in the background without blocking the UI.
  if (route.id === bundledRoute.id) db.routes.put({ key: "active", data: route }).catch(() => undefined);
  db.transaction("rw", db.days, async () => {
    await db.days.clear();
    if (days.length) await db.days.bulkPut(days);
  }).catch(() => undefined);

  return { route, days, planStartDate, storageReady };
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
