"use client";

import Dexie, { type EntityTable } from "dexie";
import type { TrailRoute, WalkingDay } from "../types";
import bundledRouteData from "../../public/data/swcp-route.json";
import { normalizeDayOrders } from "./days";

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

export async function loadInitialData(): Promise<{ route: TrailRoute; days: WalkingDay[]; storageReady: boolean }> {
  let route = bundledRoute;
  let storageReady = true;
  try {
    route = (await withTimeout(db.routes.get("active")))?.data ?? bundledRoute;
  } catch {
    storageReady = false;
  }

  let days: WalkingDay[] = [];
  try {
    days = await withTimeout(db.days.orderBy("order").toArray());
  } catch {
    storageReady = false;
  }
  if (!days.length) days = defaultDays(route);
  days = normalizeDayOrders(days);

  // The route is compiled into the app, so startup never depends on a network
  // request. Refresh IndexedDB in the background without blocking the UI.
  if (route.id === bundledRoute.id) db.routes.put({ key: "active", data: route }).catch(() => undefined);
  if (days.length) db.days.bulkPut(days).catch(() => undefined);

  return { route, days, storageReady };
}

export async function replaceRoute(route: TrailRoute) {
  await db.routes.put({ key: "active", data: route });
  await db.days.clear();
}
