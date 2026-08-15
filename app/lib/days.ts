import type { WalkingDay } from "../types";

export function normalizeDayOrders(days: WalkingDay[]): WalkingDay[] {
  return [...days]
    .sort((a, b) => a.order - b.order)
    .map((day, index) => ({ ...day, order: index + 1 }));
}
