import type { Checkpoint, PlannedPointOfInterest, WalkingDay } from "../types";

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
  let dateOffset = 0;
  return days.map((day) => {
    const scheduled = { ...day, date: dateKeyAfter(startDate, dateOffset) };
    dateOffset += day.breakAfter ? 2 : 1;
    return scheduled;
  });
}

export function breakDateAfter(day: WalkingDay): string {
  return day.breakAfter ? dateKeyAfter(day.date, 1) : "";
}

export function dayIdForDate(days: WalkingDay[], dateKey: string): string {
  return days.find((day) => day.date === dateKey)?.id ?? days[0]?.id ?? "";
}

export function dayIdContainingDistance(days: WalkingDay[], distanceKm: number): string | undefined {
  return days.find((day) => distanceKm >= day.startDistanceKm && distanceKm <= day.endDistanceKm)?.id;
}

export function daysUsingLocation(days: WalkingDay[], locationName: string): WalkingDay[] {
  return days.filter((day) => day.startName === locationName || day.endName === locationName);
}

export type ResolvedPointOfInterest = PlannedPointOfInterest & Checkpoint;

export function resolvePointsOfInterest(
  pointsOfInterest: PlannedPointOfInterest[],
  checkpoints: Checkpoint[],
): ResolvedPointOfInterest[] {
  return pointsOfInterest
    .map((point) => {
      const location = checkpoints.find((checkpoint) => checkpoint.name === point.locationName);
      return location ? { ...point, ...location } : null;
    })
    .filter((point): point is ResolvedPointOfInterest => point !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function nextPointOfInterest(
  pointsOfInterest: PlannedPointOfInterest[],
  checkpoints: Checkpoint[],
  trailDistanceKm: number,
): { point: ResolvedPointOfInterest; distanceRemainingKm: number } | null {
  const point = resolvePointsOfInterest(pointsOfInterest, checkpoints)
    .find((candidate) => candidate.distanceKm > trailDistanceKm + 0.01);
  return point ? { point, distanceRemainingKm: point.distanceKm - trailDistanceKm } : null;
}
