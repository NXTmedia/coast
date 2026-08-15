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
