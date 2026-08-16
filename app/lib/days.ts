import type { WalkingDay } from "../types";

export function normalizeDayOrders(days: WalkingDay[]): WalkingDay[] {
  return [...days]
    .sort((a, b) => a.order - b.order)
    .map((day, index) => ({ ...day, order: index + 1 }));
}

export function reorderWalkingDays(days: WalkingDay[], activeId: string, overId: string): WalkingDay[] {
  const ordered = normalizeDayOrders(days);
  const from = ordered.findIndex((day) => day.id === activeId);
  const to = ordered.findIndex((day) => day.id === overId);
  if (from < 0 || to < 0 || from === to) return ordered;

  // Breaks belong to their position in the itinerary, rather than travelling
  // with a stage when it is moved to a new position.
  const breakSlots = ordered.map((day) => Boolean(day.breakAfter));
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return ordered.map((day, index) => ({
    ...day,
    order: index + 1,
    breakAfter: index < ordered.length - 1 ? breakSlots[index] : false,
  }));
}

const legacyStarterPairs = new Set([
  "Minehead\u0000Porlock Weir",
  "Porlock Weir\u0000Lynmouth",
  "Lynmouth\u0000Combe Martin",
]);

export function removeLegacyStarterDays(days: WalkingDay[]): WalkingDay[] {
  return days.filter((day) => !legacyStarterPairs.has(`${day.startName}\u0000${day.endName}`));
}
