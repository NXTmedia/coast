import type { WalkingDay } from "../types";

export function dayDistanceKm(day: WalkingDay): number {
  return Math.max(0, day.endDistanceKm - day.startDistanceKm);
}

export function totalPlannedDistanceKm(days: WalkingDay[]): number {
  return days.reduce((total, day) => total + dayDistanceKm(day), 0);
}

export function plannedProgressKm(days: WalkingDay[], trailDistanceKm: number): number {
  return days.reduce((total, day) => {
    const progress = Math.max(0, Math.min(dayDistanceKm(day), trailDistanceKm - day.startDistanceKm));
    return total + progress;
  }, 0);
}

export function renameDayLocation(day: WalkingDay, field: "start" | "end", name: string): WalkingDay {
  return field === "start" ? { ...day, startName: name } : { ...day, endName: name };
}

export function copyPreviousDayEnd(day: WalkingDay, previous: WalkingDay): WalkingDay {
  return {
    ...day,
    startName: previous.endName,
    startDistanceKm: previous.endDistanceKm,
    startCoordinate: previous.endCoordinate,
  };
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyAfter(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function fillWalkingDayDates(days: WalkingDay[], startDate: string): WalkingDay[] {
  return days.map((day) => ({ ...day, date: dateKeyAfter(startDate, day.order - 1) }));
}

export function dayIdForDate(days: WalkingDay[], dateKey: string): string {
  return days.find((day) => day.date === dateKey)?.id ?? days[0]?.id ?? "";
}

export function dayIdContainingDistance(days: WalkingDay[], distanceKm: number): string | undefined {
  return days.find((day) => distanceKm >= day.startDistanceKm && distanceKm <= day.endDistanceKm)?.id;
}
