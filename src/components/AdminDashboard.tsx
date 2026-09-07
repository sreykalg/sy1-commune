import { formatMoney } from "@/lib/menu";
import {
  averageTicket,
  lastNDays,
  ordersOnDay,
  sumSales,
  topProducts,
} from "@/lib/analytics";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/types";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 p-5">
      <p className="text-xs tracking-[0.25em] text-neutral-400 uppercase">
        {label}
      </p>
            <p className="mt-3 text-2xl font-semibold sm:text-3xl">{value}</p>
    </div>
  );
}

export async function AdminDashboard() {
  const store = await getStore();
  const now = new Date();
  const today = ordersOnDay(store.orders, now);
  const week = lastNDays(store.orders, 7, now);
  const maxSales = Math.max(...week.map((day) => day.sales), 1);
  const products = topProducts(store.orders, 5);
  const latest = [...store.orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return (
    <div className="space-y-8 px-4 py-6 sm:space-y-10 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-neutral-400 uppercase">
            Sales analysis
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Track every ticket</h1>
        </div>
        <p
          className={`rounded-full px-4 py-2 text-sm ${
            store.pos.isOpen
              ? "bg-white text-black"
              : "border border-white/30 text-neutral-300"
          }`}
        >
          POS {store.pos.isOpen ? "open" : "closed"}
          {store.pos.openedBy ? ` · ${store.pos.openedBy}` : ""}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Today sales" value={formatMoney(sumSales(today))} />
        <Metric label="Today orders" value={String(today.length)} />
        <Metric
          label="Average ticket"
          value={formatMoney(averageTicket(today))}
        />
        <Metric
          label="Week sales"
          value={formatMoney(week.reduce((sum, day) => sum + day.sales, 0))}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-white/10 p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-400 uppercase">
            Last 7 days
          </h2>
          <div className="mt-6 flex h-48 items-end gap-3">
            {week.map((day) => (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className="w-full bg-white"
                  style={{
                    height: `${Math.max((day.sales / maxSales) * 100, day.sales > 0 ? 8 : 0)}%`,
                  }}
                  title={formatMoney(day.sales)}
                />
                <span className="text-xs text-neutral-400">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/10 p-5">
          <h2 className="text-xs tracking-[0.25em] text-neutral-400 uppercase">
            Best sellers
          </h2>
          <ul className="mt-4 space-y-4">
            {products.map((product) => (
              <li
                key={product.name}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {product.name}
                  <span className="ml-2 text-neutral-500">{product.qty} sold</span>
                </span>
                <span>{formatMoney(product.sales)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-xs tracking-[0.25em] text-neutral-400 uppercase">
          Recent orders
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/15 text-neutral-400">
              <tr>
                <th className="py-3 font-normal">Time</th>
                <th className="py-3 font-normal">Barista</th>
                <th className="py-3 font-normal">Items</th>
                <th className="py-3 font-normal text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((order: Order) => (
                <tr key={order.id} className="border-b border-white/10">
                  <td className="py-3">
                    {new Date(order.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3">{order.baristaName}</td>
                  <td className="py-3 text-neutral-300">
                    {order.items
                      .map((item) => `${item.qty}× ${item.name}`)
                      .join(", ")}
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
