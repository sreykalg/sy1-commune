import { formatMoney } from "@/lib/menu";
import {
  averageTicket,
  bestSellers,
  busiestDay,
  cafeHours,
  categorySales,
  changePercent,
  lastNDays,
  liveOrders,
  lowSellers,
  ordersOnDay,
  productStats,
  promoStats,
  salesByHour,
  sumSales,
  totalDiscount,
  unitsSold,
} from "@/lib/analytics";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/types";

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="border border-neutral-200 bg-white p-5">
      <p className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold sm:text-3xl">{value}</p>
      {hint ? <p className="mt-2 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function deltaHint(current: number, previous: number, suffix: string) {
  const pct = changePercent(current, previous);
  if (pct === null) return null;
  if (pct === 0) return `Even vs ${suffix}`;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs ${suffix}`;
}

function VerticalBars({
  items,
}: {
  items: { key: string; label: string; value: number; caption: string; display: string }[];
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="mt-6 flex h-56 items-stretch gap-2">
      {items.map((item) => {
        const pct = Math.max((item.value / max) * 100, item.value > 0 ? 6 : 0);
        return (
          <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center">
            <p className="mb-2 text-[10px] text-neutral-400">{item.display}</p>
            <div className="flex min-h-0 w-full flex-1 items-end">
              <div
                className="w-full bg-black"
                style={{ height: `${pct}%` }}
                title={item.display}
              />
            </div>
            <span className="mt-2 text-xs text-neutral-400">{item.label}</span>
            <span className="text-[10px] text-neutral-500">{item.caption}</span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBars({
  items,
  empty,
}: {
  items: { key: string; label: string; value: number; left: string; right: string }[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-neutral-500">{empty}</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 text-neutral-500">{item.right}</span>
          </div>
          <div className="mt-1.5 h-2 bg-neutral-200">
            <div
              className="h-full bg-black"
              style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">{item.left}</p>
        </li>
      ))}
    </ul>
  );
}

export async function AdminDashboard() {
  const store = await getStore();
  const now = new Date();
  const today = ordersOnDay(store.orders, now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = ordersOnDay(store.orders, yesterdayDate);
  const week = lastNDays(store.orders, 7, now);
  const previousEnd = new Date(now);
  previousEnd.setDate(now.getDate() - 7);
  const previousWeek = lastNDays(store.orders, 7, previousEnd);
  const weekSales = week.reduce((sum, day) => sum + day.sales, 0);
  const prevWeekSales = previousWeek.reduce((sum, day) => sum + day.sales, 0);
  const weekOrders = week.reduce((sum, day) => sum + day.orders, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekOrdersList = liveOrders(store.orders).filter(
    (order) => new Date(order.createdAt).getTime() >= weekStart.getTime(),
  );
  const weekStats = productStats(weekOrdersList, store.menu);
  const best = bestSellers(weekStats, 5);
  const low = lowSellers(weekStats, 5);
  const categories = categorySales(weekStats).filter((item) => item.qty > 0);
  const hours = cafeHours(salesByHour(store.orders, now, 7));
  const peak = hours.reduce(
    (bestHour, slot) => (slot.sales > bestHour.sales ? slot : bestHour),
    hours[0],
  );
  const busy = busiestDay(week);
  const promos = promoStats(weekOrdersList);
  const drinks = unitsSold(weekStats);
  const discounts = totalDiscount(weekOrdersList);
  const latest = liveOrders(store.orders)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return (
    <div className="space-y-8 px-4 py-6 sm:space-y-10 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">
            Sales analysis
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Track every ticket
          </h1>
        </div>
        <p
          className={`rounded-full px-4 py-2 text-sm ${
            store.pos.isOpen
              ? "bg-black text-white"
              : "border border-neutral-300 text-neutral-600"
          }`}
        >
          POS {store.pos.isOpen ? "open" : "closed"}
          {store.pos.openedBy ? ` · ${store.pos.openedBy}` : ""}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Today sales"
          value={formatMoney(sumSales(today))}
          hint={deltaHint(sumSales(today), sumSales(yesterday), "yesterday")}
        />
        <Metric
          label="Today orders"
          value={String(today.length)}
          hint={deltaHint(today.length, yesterday.length, "yesterday")}
        />
        <Metric
          label="Average ticket"
          value={formatMoney(averageTicket(today))}
          hint={
            today.length === 0 ? "No tickets yet today" : `${today.length} tickets today`
          }
        />
        <Metric
          label="Week sales"
          value={formatMoney(weekSales)}
          hint={deltaHint(weekSales, prevWeekSales, "last week")}
        />
        <Metric label="Week orders" value={String(weekOrders)} />
        <Metric label="Items sold" value={String(drinks)} hint="Last 7 days" />
        <Metric
          label="Busiest day"
          value={busy?.label ?? "—"}
          hint={busy ? formatMoney(busy.sales) : null}
        />
        <Metric
          label="Peak hour"
          value={peak && peak.sales > 0 ? peak.label : "—"}
          hint={peak && peak.sales > 0 ? `${peak.orders} tickets · ${formatMoney(peak.sales)}` : "Last 7 days"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-neutral-200 bg-white p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
            Sales tracking · 7 days
          </h2>
          <VerticalBars
            items={week.map((day) => ({
              key: day.date,
              label: day.label,
              value: day.sales,
              display: formatMoney(day.sales),
              caption: `${day.orders} tix`,
            }))}
          />
        </div>

        <div className="border border-neutral-200 bg-white p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
            Peak hours · 11am–11pm
          </h2>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <VerticalBars
                items={hours.map((slot) => ({
                  key: String(slot.hour),
                  label: slot.label,
                  value: slot.sales,
                  display: slot.sales > 0 ? formatMoney(slot.sales) : "",
                  caption: slot.orders ? `${slot.orders}` : "",
                }))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-neutral-200 bg-white p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
            Best selling drinks
          </h2>
          <p className="mt-1 text-xs text-neutral-500">Last 7 days · by cups sold</p>
          <HorizontalBars
            empty="No drinks sold this week."
            items={best.map((item) => ({
              key: item.id,
              label: item.name,
              value: item.qty,
              left: `${item.qty} sold`,
              right: formatMoney(item.sales),
            }))}
          />
        </div>

        <div className="border border-neutral-200 bg-white p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
            Low selling drinks
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Last 7 days · slow movers and unsold
          </p>
          <HorizontalBars
            empty="Menu is empty."
            items={low.map((item) => ({
              key: item.id,
              label: item.name,
              value: item.qty,
              left: item.qty === 0 ? "No sales" : `${item.qty} sold`,
              right: formatMoney(item.sales),
            }))}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-neutral-200 bg-white p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
            Sales by category
          </h2>
          <HorizontalBars
            empty="No category sales this week."
            items={categories.map((item) => ({
              key: item.name,
              label: item.name,
              value: item.sales,
              left: `${item.qty} items`,
              right: formatMoney(item.sales),
            }))}
          />
        </div>

        <div className="border border-neutral-200 bg-white p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
            Promotions
          </h2>
          {promos.length === 0 ? (
            <div className="mt-6 space-y-2 text-sm text-neutral-500">
              <p>No discounts on tickets this week.</p>
              <p>Week discounts {formatMoney(discounts)}</p>
            </div>
          ) : (
            <HorizontalBars
              empty="No promotions used."
              items={promos.map((item) => ({
                key: item.label,
                label: item.label,
                value: item.count,
                left: `${item.count} tickets`,
                right: formatMoney(item.discount),
              }))}
            />
          )}
        </div>
      </section>

      <section className="border border-neutral-200 bg-white p-5">
        <h2 className="text-xs tracking-[0.25em] text-neutral-500 uppercase">
          Recent orders
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <th className="py-3 font-normal">Time</th>
                <th className="py-3 font-normal">Barista</th>
                <th className="py-3 font-normal">Items</th>
                <th className="py-3 font-normal">Promo</th>
                <th className="py-3 font-normal text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((order: Order) => (
                <tr key={order.id} className="border-b border-neutral-200">
                  <td className="py-3 whitespace-nowrap">
                    {new Date(order.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3">{order.baristaName}</td>
                  <td className="py-3 text-neutral-600">
                    {order.items
                      .map((item) => `${item.qty}× ${item.name}`)
                      .join(", ")}
                  </td>
                  <td className="py-3 text-neutral-500">
                    {order.promoLabel ?? "—"}
                  </td>
                  <td className="py-3 text-right">{formatMoney(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}