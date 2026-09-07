"use client";

import { useState, useTransition } from "react";
import { closePos, createOrder, openPos } from "@/actions/pos";
import { MENU, formatMoney } from "@/lib/menu";
import type { Order, OrderItem, PosState } from "@/lib/types";

type PosClientProps = {
  pos: PosState;
  recentOrders: Order[];
};

export function PosClient({ pos, recentOrders }: PosClientProps) {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addItem(id: string, name: string, price: number) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === id);
      if (existing) {
        return current.map((item) =>
          item.productId === id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...current, { productId: id, name, qty: 1, price }];
    });
  }

  function removeItem(id: string) {
    setCart((current) =>
      current
        .map((item) =>
          item.productId === id ? { ...item, qty: item.qty - 1 } : item,
        )
        .filter((item) => item.qty > 0),
    );
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-neutral-400 uppercase">
            Point of sale
          </p>
          <p className="mt-2 text-2xl font-semibold sm:text-3xl">
            {pos.isOpen ? "POS open" : "POS closed"}
          </p>
          {pos.isOpen && pos.openedBy ? (
            <p className="mt-1 text-sm text-neutral-400">
              Opened by {pos.openedBy}
            </p>
          ) : (
            <p className="mt-1 text-sm text-neutral-400">
              Open the register to take orders.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              if (pos.isOpen) {
                await closePos();
              } else {
                await openPos();
              }
            })
          }
          className={`rounded-full px-6 py-3 text-sm font-medium transition ${
            pos.isOpen
              ? "border border-white/40 hover:bg-white hover:text-black"
              : "bg-white text-black hover:bg-neutral-200"
          }`}
        >
          {pending
            ? "Working…"
            : pos.isOpen
              ? "Close POS"
              : "Open POS"}
        </button>
      </div>

      {!pos.isOpen ? (
        <div className="border border-white/10 px-5 py-14 text-center sm:px-8 sm:py-20">
          <p className="font-serif text-4xl italic sm:text-5xl">Closed</p>
          <p className="mt-4 text-neutral-400">
            Sale In Charge must open the POS before any ticket can be sold.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MENU.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item.id, item.name, item.price)}
                className="border border-white/15 p-4 text-left transition hover:border-white hover:bg-white hover:text-black"
              >
                <p className="text-xs tracking-wide text-neutral-400 uppercase">
                  {item.category}
                </p>
                <p className="mt-3 font-medium">{item.name}</p>
                <p className="mt-1 text-sm">{formatMoney(item.price)}</p>
              </button>
            ))}
          </section>

          <aside className="border border-white/15 p-5">
            <p className="text-xs tracking-[0.25em] text-neutral-400 uppercase">
              Ticket
            </p>
            <ul className="mt-4 min-h-40 space-y-3">
              {cart.length === 0 ? (
                <li className="text-sm text-neutral-500">No drinks yet.</li>
              ) : (
                cart.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="text-left"
                    >
                      {item.qty} × {item.name}
                    </button>
                    <span>{formatMoney(item.price * item.qty)}</span>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <span>Total</span>
              <span className="text-xl font-semibold">
                {formatMoney(total)}
              </span>
            </div>
            <button
              type="button"
              disabled={pending || cart.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await createOrder(cart);
                  if (result.error) {
                    setMessage(result.error);
                    return;
                  }
                  setCart([]);
                  setMessage(`Paid ${formatMoney(result.total ?? 0)}`);
                })
              }
              className="mt-5 w-full rounded-full bg-white py-3 text-sm font-medium text-black disabled:opacity-50"
            >
              Charge
            </button>
            {message ? (
              <p className="mt-3 text-center text-sm text-neutral-300">
                {message}
              </p>
            ) : null}
          </aside>
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-xs tracking-[0.3em] text-neutral-400 uppercase">
          Recent tickets
        </h2>
        <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {recentOrders.length === 0 ? (
            <p className="py-6 text-sm text-neutral-500">No orders yet.</p>
          ) : (
            recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between py-4 text-sm"
              >
                <div>
                  <p>
                    {order.items
                      .map((item) => `${item.qty}× ${item.name}`)
                      .join(", ")}
                  </p>
                  <p className="text-neutral-500">
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <p>{formatMoney(order.total)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
