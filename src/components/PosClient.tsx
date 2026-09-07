"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { createMenuItem } from "@/actions/menu";
import { createOrder, openPos } from "@/actions/pos";
import { ItemForm, PosDrawer } from "@/components/PosDrawer";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { formatMoney } from "@/lib/menu";
import { PAYMENT_METHODS, paymentLabel } from "@/lib/payments";
import { nextTicketNo, receiptFromOrder, type ReceiptTicket } from "@/lib/escpos";
import { useReceiptPrinter } from "@/lib/receipt-printer";
import type {
  MenuItem,
  Order,
  OrderItem,
  PaymentMethod,
  PosState,
  Promotion,
  Session,
} from "@/lib/types";

type PosClientProps = {
  session: Session;
  pos: PosState;
  menu: MenuItem[];
  categories: string[];
  promotions: Promotion[];
  orders: Order[];
};

const CASH_PRESETS = [500, 1000, 2000];

export function PosClient({
  session,
  pos,
  menu,
  categories,
  promotions,
  orders,
}: PosClientProps) {
  const sellable = menu.filter((item) => item.available);
  const floorCategories = [
    "All",
    ...categories.filter((name) =>
      sellable.some((item) => item.category === name),
    ),
  ];
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tendered, setTendered] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoId, setPromoId] = useState<string | null>(null);
  const [previewTicket, setPreviewTicket] = useState<ReceiptTicket | null>(null);
  const [lastTicket, setLastTicket] = useState<ReceiptTicket | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const printer = useReceiptPrinter();
  const activePromos = promotions.filter((item) => item.active);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.filter((item) => {
      if (!item.available) return false;
      const matchesCategory = category === "All" || item.category === category;
      const matchesQuery = !needle || item.name.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [menu, category, query]);

  useEffect(() => {
    if (promoId && !promotions.some((item) => item.id === promoId && item.active)) {
      setPromoId(null);
    }
  }, [promoId, promotions]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const promo = activePromos.find((item) => item.id === promoId) ?? null;
  const discount = promo
    ? promo.type === "percent"
      ? Math.round((subtotal * promo.value) / 100)
      : Math.min(subtotal, promo.value)
    : 0;
  const total = Math.max(0, subtotal - discount);
  const isCash = paymentMethod === "cash";
  const paid = isCash ? Number(tendered) || 0 : total;
  const change = isCash && paid >= total ? paid - total : 0;
  const canCharge = pos.isOpen && cart.length > 0 && (!isCash || paid >= total);

  function addItem(id: string, name: string, price: number) {
    if (!pos.isOpen) {
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.productId === id);
      if (existing) {
        return current.map((item) =>
          item.productId === id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...current, { productId: id, name, qty: 1, price }];
    });
    setMessage(null);
  }

  function setQty(id: string, qty: number) {
    setCart((current) =>
      current
        .map((item) => (item.productId === id ? { ...item, qty } : item))
        .filter((item) => item.qty > 0),
    );
  }

  function removeLine(id: string) {
    setCart((current) => current.filter((item) => item.productId !== id));
  }

  function cancelOrder() {
    setCart([]);
    setTendered("");
    setPaymentMethod("cash");
    setPromoId(null);
    setPromoOpen(false);
    setMessage(null);
  }

  function currentTicket(): ReceiptTicket {
    return {
      ticketNo: nextTicketNo(orders),
      cashier: session.name,
      items: cart,
      subtotal,
      discount,
      promoLabel: promo?.label,
      total,
      paymentMethod,
      paid,
      change,
      at: new Date(),
    };
  }

  function printTicket() {
    if (cart.length > 0) {
      setPreviewTicket(currentTicket());
      return;
    }
    if (lastTicket) {
      setPreviewTicket(lastTicket);
      return;
    }
    setMessage("Add items before printing.");
  }

  function reprintOrder(order: Order) {
    setMenuOpen(false);
    setPreviewTicket(receiptFromOrder(order, orders));
  }

  async function sendSlips(ticket: ReceiptTicket) {
    if (!printer.supported) {
      throw new Error("Open the POS in Chrome or Edge to use the receipt printer.");
    }
    if (!printer.connected) {
      throw new Error("Connect the receipt printer from the menu first.");
    }
    await printer.print(ticket);
  }

  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-neutral-100 text-black">
      <div className="pos-screen flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between bg-black px-4 text-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-white" fill="none">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" />
              ) : (
                <path d="M5 7h14M5 12h14M5 17h14" strokeWidth="1.8" />
              )}
            </svg>
          </button>
          <p className="text-lg font-bold tracking-tight lowercase">commune.</p>
        </div>
        <Image
          src="/images/logo.jpg"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 rounded-full object-cover"
        />
      </header>

      {addingProduct ? (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 text-black shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add product</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAddingProduct(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                  <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
            <ItemForm
              item={null}
              categories={categories}
              defaultCategory={category === "All" ? categories[0] : category}
              pending={pending}
              onCancel={() => setAddingProduct(false)}
              onSave={(formData) =>
                startTransition(async () => {
                  const result = await createMenuItem(formData);
                  if (result.error) {
                    setMessage(result.error);
                    return;
                  }
                  setAddingProduct(false);
                  setMessage("Product added.");
                })
              }
            />
          </div>
        </div>
      ) : null}

      {previewTicket ? (
        <ReceiptPreview
          ticket={previewTicket}
          paperWidth={printer.paperWidth}
          printerReady={printer.connected}
          pending={pending}
          onClose={() => setPreviewTicket(null)}
          onPrint={() =>
            startTransition(async () => {
              try {
                await sendSlips(previewTicket);
                setMessage("Customer and barista copies sent.");
                setPreviewTicket(null);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not print receipt.",
                );
              }
            })
          }
        />
      ) : null}

      {menuOpen ? (
        <PosDrawer
          session={session}
          pos={pos}
          menu={menu}
          categories={categories}
          promotions={promotions}
          orders={orders}
          printer={printer}
          onClose={() => setMenuOpen(false)}
          onReprint={reprintOrder}
        />
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        {!pos.isOpen ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-100 px-6 text-center">
            <p className="font-serif text-4xl italic sm:text-5xl">Closed</p>
            <p className="mt-3 max-w-sm text-sm text-neutral-500">
              Open the POS to take orders.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => openPos())}
              className="mt-8 rounded-full bg-black px-8 py-3 text-sm font-medium text-white"
            >
              Open POS
            </button>
          </div>
        ) : null}

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="relative ml-auto w-full max-w-sm">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 stroke-neutral-400"
                fill="none"
              >
                <circle cx="11" cy="11" r="6" strokeWidth="1.6" />
                <path d="M16 16l4 4" strokeWidth="1.6" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item..."
                className="w-full rounded-full border border-neutral-300 bg-white py-2.5 pr-4 pl-10 text-sm outline-none placeholder:text-neutral-400 focus:border-black"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItem(item.id, item.name, item.price)}
                  className="rounded-2xl border border-neutral-300 bg-white p-3 text-center transition hover:border-black"
                >
                  <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl bg-neutral-100">
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 45vw, 18vw"
                      className="object-cover"
                    />
                  </div>
                  <p className="mt-3 text-sm font-medium">{item.name}</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {formatMoney(item.price)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-4 py-3">
            {floorCategories.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                className={`rounded-xl border px-4 py-2 text-sm transition ${
                  category === name
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white hover:border-black"
                }`}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              onClick={cancelOrder}
              className="ml-auto rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-black"
            >
              Cancel Order
            </button>
          </div>

          {pos.isOpen ? (
            <button
              type="button"
              aria-label="Add product"
              onClick={() => setAddingProduct(true)}
              className="absolute right-5 bottom-20 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:scale-105"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor">
                <path d="M12 5v14M5 12h14" strokeWidth="2" />
              </svg>
            </button>
          ) : null}
        </section>

        <aside className="flex min-h-0 w-full flex-col border-t border-neutral-200 bg-white md:w-[360px] md:border-t-0 md:border-l">
          <h2 className="shrink-0 py-4 text-center text-xl font-semibold">
            Checkout
          </h2>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 text-[11px] tracking-wide text-neutral-400 uppercase">
            <span>Name</span>
            <span className="w-24 text-center">Qty</span>
            <span className="w-16 text-right">Price</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <li className="py-10 text-center text-sm text-neutral-400">
                No items yet.
              </li>
            ) : (
              cart.map((item) => (
                <li
                  key={item.productId}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => removeLine(item.productId)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 hover:text-black"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                        <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" strokeWidth="1.6" />
                      </svg>
                    </button>
                    <span className="truncate text-sm">{item.name}</span>
                  </div>
                  <div className="flex w-24 items-center justify-center gap-2">
                    <button
                      type="button"
                      aria-label={`Less ${item.name}`}
                      onClick={() => setQty(item.productId, item.qty - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-sm"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-sm">{item.qty}</span>
                    <button
                      type="button"
                      aria-label={`More ${item.name}`}
                      onClick={() => setQty(item.productId, item.qty + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-sm"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-16 text-right text-sm">
                    {formatMoney(item.price * item.qty)}
                  </span>
                </li>
              ))
            )}
          </ul>

          <div className="shrink-0 space-y-3 border-t border-neutral-200 px-4 py-4">
            <div>
              <p className="mb-2 text-sm text-neutral-500">Pay with</p>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id)}
                    className={`rounded-xl border py-2 text-xs sm:text-sm ${
                      paymentMethod === method.id
                        ? "border-black bg-black text-white"
                        : "border-neutral-300 bg-white hover:border-black"
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
            {isCash ? (
              <>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-500">Amount</span>
                  <input
                    inputMode="numeric"
                    value={tendered}
                    onChange={(event) =>
                      setTendered(event.target.value.replace(/[^\d]/g, ""))
                    }
                    placeholder="0"
                    className="w-28 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-right outline-none focus:border-black"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTendered(String(total || ""))}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-black"
                  >
                    Exact
                  </button>
                  {CASH_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTendered(String(value))}
                      className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-black"
                    >
                      {formatMoney(value)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                {paymentLabel(paymentMethod)} · exact {formatMoney(total)}
              </p>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && promo ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">{promo.label}</span>
                <span>−{formatMoney(discount)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Total</span>
              <span className="text-lg font-semibold">{formatMoney(total)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">{isCash ? "Change" : "Paid"}</span>
              <span>{formatMoney(isCash ? change : total)}</span>
            </div>
            {promoOpen ? (
              <div className="grid grid-cols-2 gap-2">
                {activePromos.length === 0 ? (
                  <p className="col-span-2 text-center text-xs text-neutral-500">
                    Add promotions in the menu drawer.
                  </p>
                ) : (
                  activePromos.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setPromoId((current) => (current === item.id ? null : item.id))
                      }
                      className={`rounded-xl border px-3 py-2 text-xs ${
                        promoId === item.id
                          ? "border-black bg-black text-white"
                          : "border-neutral-300 bg-white hover:border-black"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPromoOpen((value) => !value)}
                className={`rounded-xl border py-2.5 text-xs sm:text-sm ${
                  promoId
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 hover:border-black"
                }`}
              >
                Promotions
              </button>
              <button
                type="button"
                onClick={cancelOrder}
                className="rounded-xl border border-neutral-300 py-2.5 text-xs hover:border-black sm:text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={printTicket}
                className={`rounded-xl border py-2.5 text-xs sm:text-sm ${
                  printer.connected || lastTicket || cart.length > 0
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 hover:border-black"
                }`}
              >
                Print
              </button>
            </div>
            <button
              type="button"
              disabled={pending || !canCharge}
              onClick={() =>
                startTransition(async () => {
                  const ticket = currentTicket();
                  const result = await createOrder(
                    cart,
                    promoId,
                    paymentMethod,
                    paid,
                  );
                  if (result.error) {
                    setMessage(result.error);
                    return;
                  }
                  const saved: ReceiptTicket = {
                    ...ticket,
                    ticketNo: result.ticketNo || ticket.ticketNo,
                  };
                  setLastTicket(saved);
                  setCart([]);
                  setTendered("");
                  setPaymentMethod("cash");
                  setPromoId(null);
                  setPromoOpen(false);
                  if (printer.connected) {
                    try {
                      await printer.print(saved);
                      setMessage(
                        `Paid ${formatMoney(result.total ?? 0)} · printed · tap Print to reprint`,
                      );
                    } catch {
                      setMessage(
                        `Paid ${formatMoney(result.total ?? 0)} · printer failed · tap Print`,
                      );
                    }
                    return;
                  }
                  setMessage(
                    `Paid ${formatMoney(result.total ?? 0)} · tap Print for last receipt`,
                  );
                })
              }
              className="relative w-full rounded-2xl border-2 border-black py-3 text-sm font-medium disabled:opacity-40"
            >
              Proceed Order
              <Image
                src="/images/logo.jpg"
                alt=""
                width={32}
                height={32}
                className="absolute top-1/2 right-3 h-8 w-8 -translate-y-1/2 rounded-full object-cover"
              />
            </button>
            {message ? (
              <p className="text-center text-sm text-neutral-500">{message}</p>
            ) : null}
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
