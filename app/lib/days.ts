import type { WalkingDay } from "../types";

export function breakDayCount(day: WalkingDay): number {
  if (Number.isFinite(day.breakDaysAfter)) return Math.max(0, Math.floor(day.breakDaysAfter ?? 0));
  return day.breakAfter ? 1 : 0;
}

export function normalizeDayOrders(days: WalkingDay[]): WalkingDay[] {
  const ordered = [...days].sort((a, b) => a.order - b.order);
  return ordered.map((day, index) => ({
    ...day,
    order: index + 1,
    breakDaysAfter: index < ordered.length - 1 ? breakDayCount(day) : 0,
    breakAfter: undefined,
  }));
}

export function reorderWalkingDays(days: WalkingDay[], activeId: string, overId: string): WalkingDay[] {
  const ordered = normalizeDayOrders(days);
  const from = ordered.findIndex((day) => day.id === activeId);
  const to = ordered.findIndex((day) => day.id === overId);
  if (from < 0 || to < 0 || from === to) return ordered;

  // Breaks belong to their position in the itinerary, rather than travelling
  // with a stage when it is moved to a new position.
  const breakSlots = ordered.map(breakDayCount);
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return ordered.map((day, index) => ({
    ...day,
    order: index + 1,
    breakDaysAfter: index < ordered.length - 1 ? breakSlots[index] : 0,
    breakAfter: undefined,
  }));
}
