import { PAYMENT_METHODS, parsePayment, paymentLabel } from "@/lib/payments";
import type { Order, PaymentMethod } from "@/lib/types";

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function liveOrders(orders: Order[]): Order[] {
  return orders.filter((order) => !order.voided);
}

export function sumSales(orders: Order[]): number {
  return liveOrders(orders).reduce((sum, order) => sum + order.total, 0);
}

export function averageTicket(orders: Order[]): number {
  const live = liveOrders(orders);
  if (live.length === 0) return 0;
  return sumSales(live) / live.length;
}

export function ordersOnDay(orders: Order[], day: Date): Order[] {
  const start = startOfDay(day).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return liveOrders(orders).filter((order) => {
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
  return bestSellers(productStats(orders), limit).map((item) => ({
    name: item.name,
    qty: item.qty,
    sales: item.sales,
  }));
}

export type ProductStat = {
  id: string;
  name: string;
  category: string;
  qty: number;
  sales: number;
};

export function productStats(
  orders: Order[],
  menu: { id: string; name: string; category: string }[] = [],
): ProductStat[] {
  const map = new Map<string, ProductStat>();

  for (const item of menu) {
    map.set(item.id, {
      id: item.id,
      name: item.name,
      category: item.category,
      qty: 0,
      sales: 0,
    });
  }

  for (const order of liveOrders(orders)) {
    for (const line of order.items) {
      const current = map.get(line.productId) ?? {
        id: line.productId,
        name: line.name,
        category: "Other",
        qty: 0,
        sales: 0,
      };
      current.qty += line.qty;
      current.sales += line.qty * line.price;
      current.name = line.name;
      map.set(line.productId, current);
    }
  }

  return [...map.values()];
}

export function bestSellers(stats: ProductStat[], limit = 5): ProductStat[] {
  return [...stats]
    .sort((a, b) => b.qty - a.qty || b.sales - a.sales)
    .slice(0, limit);
}

export function lowSellers(stats: ProductStat[], limit = 5): ProductStat[] {
  return [...stats]
    .sort((a, b) => a.qty - b.qty || a.sales - b.sales)
    .slice(0, limit);
}

export function unitsSold(stats: ProductStat[]): number {
  return stats.reduce((sum, item) => sum + item.qty, 0);
}

export function categorySales(stats: ProductStat[]) {
  const map = new Map<string, { name: string; qty: number; sales: number }>();
  for (const item of stats) {
    const current = map.get(item.category) ?? {
      name: item.category,
      qty: 0,
      sales: 0,
    };
    current.qty += item.qty;
    current.sales += item.sales;
    map.set(item.category, current);
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales);
}

export function salesByHour(orders: Order[], now = new Date(), days = 7) {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`,
    sales: 0,
    orders: 0,
  }));

  for (const order of liveOrders(orders)) {
    const time = new Date(order.createdAt);
    if (time < start) continue;
    const hour = time.getHours();
    buckets[hour].sales += order.total;
    buckets[hour].orders += 1;
  }

  return buckets;
}

export function cafeHours(buckets: ReturnType<typeof salesByHour>) {
  return buckets.filter((slot) => slot.hour >= 11 && slot.hour <= 23);
}

export function changePercent(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function totalDiscount(orders: Order[]): number {
  return liveOrders(orders).reduce((sum, order) => sum + (order.discount ?? 0), 0);
}

export function paymentStats(orders: Order[]) {
  const buckets: Record<
    PaymentMethod,
    { method: PaymentMethod; label: string; count: number; sales: number }
  > = {
    cash: { method: "cash", label: paymentLabel("cash"), count: 0, sales: 0 },
    gcash: { method: "gcash", label: paymentLabel("gcash"), count: 0, sales: 0 },
    maya: { method: "maya", label: paymentLabel("maya"), count: 0, sales: 0 },
  };
  for (const order of liveOrders(orders)) {
    const method = parsePayment(order.paymentMethod);
    buckets[method].count += 1;
    buckets[method].sales += order.total;
  }
  return PAYMENT_METHODS.map((item) => buckets[item.id]);
}

export function promoStats(orders: Order[]) {
  const map = new Map<string, { label: string; count: number; discount: number }>();
  for (const order of liveOrders(orders)) {
    if (!order.promoLabel || !order.discount) continue;
    const current = map.get(order.promoLabel) ?? {
      label: order.promoLabel,
      count: 0,
      discount: 0,
    };
    current.count += 1;
    current.discount += order.discount;
    map.set(order.promoLabel, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function busiestDay(days: ReturnType<typeof lastNDays>) {
  return days.reduce(
    (best, day) => (day.sales > best.sales ? day : best),
    days[0],
  );
}
