import type { Order } from "@/lib/types";

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function sumSales(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + order.total, 0);
}

export function averageTicket(orders: Order[]): number {
  if (orders.length === 0) return 0;
  return sumSales(orders) / orders.length;
}

export function ordersOnDay(orders: Order[], day: Date): Order[] {
  const start = startOfDay(day).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return orders.filter((order) => {
    const time = new Date(order.createdAt).getTime();
    return time >= start && time < end;
  });
}

export function lastNDays(orders: Order[], days: number, now = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - 1 - index));
    const dayOrders = ordersOnDay(orders, date);
    return {
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      date: date.toISOString().slice(0, 10),
      orders: dayOrders.length,
      sales: sumSales(dayOrders),
    };
  });
}

export function topProducts(orders: Order[], limit = 5) {
  const map = new Map<string, { name: string; qty: number; sales: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const current = map.get(item.productId) ?? {
        name: item.name,
        qty: 0,
        sales: 0,
      };
      current.qty += item.qty;
      current.sales += item.qty * item.price;
      map.set(item.productId, current);
    }
  }

  return [...map.values()]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}
