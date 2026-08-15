"use client";

import Dexie, { type EntityTable } from "dexie";
import type { TrailRoute, WalkingDay } from "../types";

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

export async function loadInitialData(): Promise<{ route: TrailRoute; days: WalkingDay[] }> {
  let route = (await db.routes.get("active"))?.data;
  if (!route) {
    const response = await fetch("/data/swcp-route.json");
    if (!response.ok) throw new Error("The bundled route could not be loaded.");
    route = await response.json() as TrailRoute;
    await db.routes.put({ key: "active", data: route });
  }

  let days = await db.days.orderBy("order").toArray();
  if (!days.length) {
    const hasBundledStops = route.checkpoints.some((point) => point.name === "Porlock Weir");
    const defaults = hasBundledStops
      ? [["Minehead", "Porlock Weir"], ["Porlock Weir", "Lynmouth"], ["Lynmouth", "Combe Martin"]]
      : [[route.checkpoints[0].name, route.checkpoints.at(-1)!.name]];
    days = defaults.map(([startName, endName], index) => {
      const start = route.checkpoints.find((point) => point.name === startName)!;
      const end = route.checkpoints.find((point) => point.name === endName)!;
      return {
        id: crypto.randomUUID(),
        order: index + 1,
        date: "",
        startName,
        endName,
        startDistanceKm: start.distanceKm,
        endDistanceKm: end.distanceKm,
      };
    });
    await db.days.bulkPut(days);
  }
  return { route, days };
}

export async function replaceRoute(route: TrailRoute) {
  await db.routes.put({ key: "active", data: route });
  await db.days.clear();
}
