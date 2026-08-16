import type { WalkingDay } from "../types";

export function normalizeDayOrders(days: WalkingDay[]): WalkingDay[] {
  return [...days]
    .sort((a, b) => a.order - b.order)
    .map((day, index) => ({ ...day, order: index + 1 }));
}

const legacyStarterPairs = new Set([
  "Minehead\u0000Porlock Weir",
  "Porlock Weir\u0000Lynmouth",
  "Lynmouth\u0000Combe Martin",
]);

export function removeLegacyStarterDays(days: WalkingDay[]): WalkingDay[] {
  return days.filter((day) => !legacyStarterPairs.has(`${day.startName}\u0000${day.endName}`));
}
