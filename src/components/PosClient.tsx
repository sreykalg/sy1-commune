"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { logout } from "@/actions/auth";
import { createOrder, openPos, requestVoidApproval, verifyManager, voidCheckout, voidOrder } from "@/actions/pos";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { formatMoney } from "@/lib/menu";
import { phDateString, phDateTimeLabel } from "@/lib/datetime";
import { PAYMENT_METHODS, parsePayment, paymentLabel } from "@/lib/payments";
import { drinkReceipts, nextTicketNo, type ReceiptTicket } from "@/lib/escpos";
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
const CHECKOUT_KEY = "commune_pos_checkout";
const TEST_PRINTER_ENABLED = process.env.NEXT_PUBLIC_TEST_PRINTER === "true";

type SavedCheckout = {
  userId: string;
  cart: OrderItem[];
  tendered: string;
  paymentMethod: PaymentMethod;
  promoId: string | null;
};

function readCheckout(userId: string, menu: MenuItem[]): SavedCheckout | null {
  try {
    const raw = window.localStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedCheckout;
    if (saved.userId !== userId || !Array.isArray(saved.cart)) return null;

    const catalog = new Map(menu.map((item) => [item.id, item]));
    const cart = saved.cart.flatMap((item) => {
      const product = catalog.get(item.productId);
      if (!product || product.available === false) return [];
      const qty = Math.floor(Number(item.qty));
      if (!Number.isFinite(qty) || qty < 1) return [];
      return [
        {
          productId: product.id,
          name: product.name,
          qty,
          price: product.price,
        },
      ];
    });

    return {
      userId,
      cart,
      tendered: typeof saved.tendered === "string" ? saved.tendered : "",
      paymentMethod: parsePayment(saved.paymentMethod),
      promoId: typeof saved.promoId === "string" ? saved.promoId : null,
    };
  } catch {
    return null;
  }
}

function writeCheckout(value: SavedCheckout) {
  window.localStorage.setItem(CHECKOUT_KEY, JSON.stringify(value));
}

export function PosClient({
  session,
  pos,
  menu,
  categories,
  promotions,
  orders,
}: PosClientProps) {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tendered, setTendered] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidUsername, setVoidUsername] = useState("");
  const [voidPassword, setVoidPassword] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [voidSearch, setVoidSearch] = useState("");
  const [voidTodayOnly, setVoidTodayOnly] = useState(true);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoId, setPromoId] = useState<string | null>(null);
  const [previewTicket, setPreviewTicket] = useState<ReceiptTicket | null>(null);
  const [lastTicket, setLastTicket] = useState<ReceiptTicket | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const printer = useReceiptPrinter();
  const [checkoutReady, setCheckoutReady] = useState(false);
  const activePromos = promotions.filter((item) => item.active);

  // Helper function to normalize category strings (combines "Non Coffee" and "Non-Coffee")
  const normalizeCat = (catName: string) => catName.replace(/^non\s*coffee$/i, "Non-Coffee");

  // Deduplicate categories for the filter buttons
  const floorCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((cat) => {
      set.add(normalizeCat(cat));
    });
    return ["All", ...Array.from(set)];
  }, [categories]);

  // Filter items based on query and normalized category match
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.filter((item) => {
      if (!item.available) return false;

      const itemCatNormalized = normalizeCat(item.category);
      const selectedCatNormalized = normalizeCat(category);

      const matchesCategory =
        category === "All" || itemCatNormalized === selectedCatNormalized;
      const matchesQuery = !needle || item.name.toLowerCase().includes(needle);

      return matchesCategory && matchesQuery;
    });
  }, [menu, category, query]);

  useEffect(() => {
    const saved = readCheckout(session.userId, menu);
    if (saved) {
      setCart(saved.cart);
      setTendered(saved.tendered);
      setPaymentMethod(saved.paymentMethod);
      setPromoId(saved.promoId);
    }
    setCheckoutReady(true);
  }, [session.userId, menu]);

  useEffect(() => {
    if (!checkoutReady) return;
    writeCheckout({
      userId: session.userId,
      cart,
      tendered,
      paymentMethod,
      promoId,
    });
  }, [checkoutReady, session.userId, cart, tendered, paymentMethod, promoId]);

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
  const isManager = session.role === "manager";
  const voidTickets = useMemo(() => {
    const needle = voidSearch.trim().toLowerCase();
    const today = phDateString();
    return [...orders]
      .filter((order) => !order.voided)
      .filter((order) => !voidTodayOnly || phDateString(order.createdAt) === today)
      .filter((order) => {
        if (!needle) return true;
        const haystack = [
          String(order.ticketNo ?? ""),
          order.baristaName,
          formatMoney(order.total),
          ...order.items.map((item) => `${item.qty} ${item.name}`),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, voidSearch, voidTodayOnly]);
  const selectedVoidOrder = orders.find((order) => order.id === voidTargetId);
  const cashierPaidVoid = !isManager && cart.length === 0 ? lastOrderId : null;
  const canCharge = !isManager && pos.isOpen && cart.length > 0 && (!isCash || paid >= total);

  function addItem(id: string, name: string, price: number) {
    if (!pos.isOpen || isManager) {
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

  function handleConfirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidReason.trim()) {
      setMessage("Enter a reason for voiding.");
      return;
    }

    startTransition(async () => {
      if (isManager) {
        if (!voidTargetId) {
          setMessage("Select a ticket to void.");
          return;
        }
        const result = await voidOrder(voidTargetId, voidReason);
        if ("error" in result && result.error) {
          setMessage(result.error);
          return;
        }
        setVoidReason("");
        setVoidTargetId(null);
        setVoidModalOpen(false);
        setMessage("Transaction voided.");
        return;
      }

      if (!voidUsername || !voidPassword) {
        setMessage("Manager credentials required to void.");
        return;
      }
      const auth = await verifyManager(voidUsername, voidPassword);
      if ("error" in auth && auth.error) {
        setMessage(auth.error);
        return;
      }

      if (cart.length > 0) {
        const result = await voidCheckout(
          cart,
          voidReason,
          voidUsername,
          voidPassword,
          promoId,
          paymentMethod,
        );
        if ("error" in result && result.error) {
          setMessage(result.error);
          return;
        }
        setCart([]);
        setTendered("");
        setPaymentMethod("cash");
        setPromoId(null);
        setPromoOpen(false);
        setVoidUsername("");
        setVoidPassword("");
        setVoidReason("");
        setVoidModalOpen(false);
        setMessage("Checkout voided.");
        return;
      }

      const targetId = voidTargetId || lastOrderId;
      if (!targetId) {
        setMessage("No ticket to void.");
        return;
      }
      const result = await voidOrder(targetId, voidReason, voidUsername, voidPassword);
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      setCart([]);
      setTendered("");
      setPaymentMethod("cash");
      setPromoId(null);
      setPromoOpen(false);
      setLastOrderId(null);
      setLastTicket(null);
      setVoidUsername("");
      setVoidPassword("");
      setVoidReason("");
      setVoidTargetId(null);
      setVoidModalOpen(false);
      setMessage("Transaction voided.");
    });
  }

  function handleRequestAdmin() {
    if (!voidReason.trim()) {
      setMessage("Enter a reason for voiding.");
      return;
    }

    startTransition(async () => {
      const result = await requestVoidApproval({
        reason: voidReason,
        orderId: cart.length > 0 ? null : voidTargetId || lastOrderId,
        cart: cart.length > 0 ? cart : undefined,
        promoId,
        paymentMethod,
      });
      if (result && "error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      if (cart.length > 0) {
        setCart([]);
        setTendered("");
        setPaymentMethod("cash");
        setPromoId(null);
        setPromoOpen(false);
      }
      setVoidUsername("");
      setVoidPassword("");
      setVoidReason("");
      setVoidTargetId(null);
      setVoidModalOpen(false);
      setMessage("Void request sent to admin.");
    });
  }

  function currentTicket(): ReceiptTicket {
    return {
      ticketNo: nextTicketNo(orders),
      barista: session.name,
      items: cart.map((item) => ({
        ...item,
        category: menu.find((menuItem) => menuItem.id === item.productId)?.category,
      })),
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
      const ticket = currentTicket();
      if (drinkReceipts(ticket).length === 0) {
        setMessage("Add drinks before printing.");
        return;
      }
      setPreviewTicket(ticket);
      return;
    }
    if (lastTicket) {
      if (drinkReceipts(lastTicket).length === 0) {
        setMessage("The last order has no drinks to print.");
        return;
      }
      setPreviewTicket(lastTicket);
      return;
    }
    setMessage("Add items before printing.");
  }

  async function sendSlips(ticket: ReceiptTicket) {
    if (!printer.supported) {
      throw new Error("Open the POS in Chrome or Edge to use the receipt printer.");
    }
    if (!printer.connected) {
      throw new Error("Connect the receipt printer first.");
    }
    await printer.print(ticket);
  }

  return (
    <div className="pos-root relative flex h-svh flex-col overflow-hidden bg-neutral-100 text-black">
      <div className="pos-screen flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between bg-black px-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <p className="text-base font-bold tracking-tight lowercase">commune.</p>
            <p className="truncate text-sm font-medium text-white/80">
              {session.name}
              <span className="ml-2 text-xs font-normal text-white/50">
                {isManager ? "manager" : "cashier"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !printer.supported}
              onClick={() =>
                startTransition(async () => {
                  try {
                    if (printer.connected) {
                      await printer.disconnect();
                      setMessage("Printer disconnected.");
                      return;
                    }
                    await printer.connect();
                    setMessage("Printer connected.");
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : "Printer error.",
                    );
                  }
                })
              }
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white active:scale-95 disabled:opacity-50"
            >
              {printer.connected ? "Printer on" : "Connect printer"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (cart.length > 0) {
                  setMessage("Finish or void the checkout before logging out.");
                  return;
                }
                startTransition(async () => await logout());
              }}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white active:scale-95 disabled:opacity-50"
            >
              {pending ? "Logging out..." : "Log out"}
            </button>
          </div>
        </header>

        {/* Void Modal */}
        {voidModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <form
              onSubmit={handleConfirmVoid}
              className="relative flex w-full max-w-md flex-col rounded-3xl bg-white p-6 shadow-2xl transition-all"
            >
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setVoidModalOpen(false)}
                className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-black transition"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                  <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <div className="mb-6 text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
                    <path
                      d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM12 3a9 9 0 100 18 9 9 0 000-18z"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-900">
                  {isManager ? "Void this ticket?" : "Void checkout"}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {isManager
                    ? "This cannot be undone."
                    : "Ask a manager, or send a request to admin."}
                </p>
              </div>

              {selectedVoidOrder || (cashierPaidVoid && lastTicket) ? (
                <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left">
                  {selectedVoidOrder ? (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold">
                          Ticket #{selectedVoidOrder.ticketNo ?? selectedVoidOrder.id.slice(-4)}
                        </p>
                        <p className="text-sm font-semibold">{formatMoney(selectedVoidOrder.total)}</p>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {phDateTimeLabel(selectedVoidOrder.createdAt)} · {selectedVoidOrder.baristaName}
                      </p>
                      <p className="mt-2 text-xs text-neutral-700">
                        {selectedVoidOrder.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                      </p>
                    </>
                  ) : lastTicket ? (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold">Ticket #{lastTicket.ticketNo}</p>
                        <p className="text-sm font-semibold">{formatMoney(lastTicket.total)}</p>
                      </div>
                      <p className="mt-2 text-xs text-neutral-700">
                        {lastTicket.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-4">
                {!isManager ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-700">
                      Manager username
                    </label>
                    <input
                      type="text"
                      placeholder="Enter username"
                      value={voidUsername}
                      onChange={(e) => setVoidUsername(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-black focus:bg-white focus:ring-1 focus:ring-black"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-700">
                      Manager password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={voidPassword}
                      onChange={(e) => setVoidPassword(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-black focus:bg-white focus:ring-1 focus:ring-black"
                    />
                  </div>
                </div>
                ) : null}

                <div className="pt-1">
                  <label className="mb-1 block text-xs font-semibold text-neutral-700">
                    Reason for Voiding <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g., Customer changed mind, wrong order input..."
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-black focus:bg-white focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVoidModalOpen(false)}
                    className="w-1/3 rounded-xl border border-neutral-200 py-2.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 rounded-xl bg-black py-2.5 text-xs font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
                  >
                    {isManager ? "Void ticket" : "Confirm Void"}
                  </button>
                </div>
                {!isManager ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={handleRequestAdmin}
                    className="rounded-xl border border-neutral-300 py-2.5 text-xs font-medium text-neutral-700 transition hover:border-black hover:text-black disabled:opacity-40"
                  >
                    Request admin
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        ) : null}

        {previewTicket ? (
          <ReceiptPreview
            ticket={previewTicket}
            paperWidth={printer.paperWidth}
            printerReady={printer.connected}
            testPrinterEnabled={TEST_PRINTER_ENABLED}
            pending={pending}
            onClose={() => setPreviewTicket(null)}
            onPrint={() =>
              startTransition(async () => {
                try {
                  await sendSlips(previewTicket);
                  setMessage("Drink receipts sent.");
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

        <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
          {!pos.isOpen ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-100 px-6 text-center">
              <p className="font-serif text-4xl italic sm:text-5xl">Closed</p>
              <p className="mt-3 max-w-sm text-sm text-neutral-500">
                Open the POS to {isManager ? "void tickets." : "take orders."}.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => openPos())}
                className="mt-8 rounded-full bg-black px-8 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-neutral-800"
              >
                Open POS
              </button>
            </div>
          ) : null}

          {isManager ? (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-100">
              <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Void tickets</h2>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      {voidTickets.length} open {voidTickets.length === 1 ? "ticket" : "tickets"}
                      {voidTodayOnly ? " today" : ""}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex rounded-full border border-neutral-200 bg-neutral-50 p-1">
                      <button
                        type="button"
                        onClick={() => setVoidTodayOnly(true)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          voidTodayOnly ? "bg-black text-white" : "text-neutral-600 hover:text-black"
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoidTodayOnly(false)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          !voidTodayOnly ? "bg-black text-white" : "text-neutral-600 hover:text-black"
                        }`}
                      >
                        All
                      </button>
                    </div>
                    <div className="relative sm:w-72">
                      <svg
                        viewBox="0 0 24 24"
                        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 stroke-neutral-400"
                        fill="none"
                      >
                        <circle cx="11" cy="11" r="6" strokeWidth="1.6" />
                        <path d="M16 16l4 4" strokeWidth="1.6" />
                      </svg>
                      <input
                        value={voidSearch}
                        onChange={(event) => setVoidSearch(event.target.value)}
                        placeholder="Search ticket, item, or cashier"
                        className="w-full rounded-full border border-neutral-300 bg-white py-2 pr-4 pl-10 text-sm outline-none placeholder:text-neutral-400 focus:border-black"
                      />
                    </div>
                  </div>
                </div>
                {message ? <p className="mt-3 text-sm text-neutral-600">{message}</p> : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {voidTickets.length === 0 ? (
                  <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white text-sm text-neutral-400">
                    No tickets to void.
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {voidTickets.map((order) => (
                        <article key={order.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold">
                                #{order.ticketNo ?? order.id.slice(-4)}
                              </p>
                              <p className="mt-0.5 text-xs text-neutral-500">
                                {phDateTimeLabel(order.createdAt)} · {order.baristaName}
                              </p>
                            </div>
                            <p className="text-base font-semibold">{formatMoney(order.total)}</p>
                          </div>
                          <p className="mt-2 text-sm text-neutral-700">
                            {order.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                          </p>
                          <p className="mt-1 text-xs text-neutral-400">{paymentLabel(order.paymentMethod)}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setVoidTargetId(order.id);
                              setVoidReason("");
                              setVoidModalOpen(true);
                            }}
                            className="mt-3 w-full rounded-xl bg-black py-3 text-sm font-medium text-white hover:bg-neutral-800"
                          >
                            Void ticket
                          </button>
                        </article>
                      ))}
                    </div>

                    <div className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm md:block">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-black text-xs font-semibold tracking-wide text-white uppercase">
                          <tr>
                            <th className="px-4 py-3">Ticket</th>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Cashier</th>
                            <th className="px-4 py-3">Items</th>
                            <th className="px-4 py-3">Pay</th>
                            <th className="px-4 py-3 text-right">Total</th>
                            <th className="px-4 py-3 text-right"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {voidTickets.map((order) => (
                            <tr key={order.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                              <td className="px-4 py-4 font-semibold whitespace-nowrap">
                                #{order.ticketNo ?? order.id.slice(-4)}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-neutral-600">
                                {phDateTimeLabel(order.createdAt)}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">{order.baristaName}</td>
                              <td className="max-w-[320px] px-4 py-4 text-neutral-700">
                                {order.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-neutral-500">
                                {paymentLabel(order.paymentMethod)}
                              </td>
                              <td className="px-4 py-4 text-right font-semibold whitespace-nowrap">
                                {formatMoney(order.total)}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidTargetId(order.id);
                                    setVoidReason("");
                                    setVoidModalOpen(true);
                                  }}
                                  className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800"
                                >
                                  Void
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
          {/* Menu Catalog Section */}
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-3 px-4 py-2">
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
                  className="w-full rounded-full border border-neutral-300 bg-white py-2 pr-4 pl-10 text-xs outline-none placeholder:text-neutral-400 focus:border-black"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
              {items.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                  No items found in this category.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItem(item.id, item.name, item.price)}
                      disabled={isManager}
                      className="rounded-2xl border border-neutral-300 bg-white p-3 text-center transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <p className="text-xs font-medium">{item.name}</p>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {formatMoney(item.price)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Category Navigation */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-200 px-4 py-2">
              {floorCategories.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    category === name
                      ? "border-black bg-black text-white"
                      : "border-neutral-300 bg-white hover:border-black"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>

          {/* Checkout Panel Sidebar */}
          <aside className="flex min-h-0 w-full flex-col border-t border-neutral-200 bg-white md:w-[320px] lg:w-[350px] md:border-t-0 md:border-l">
            <h2 className="shrink-0 py-2.5 text-center text-lg font-semibold">
              Checkout
            </h2>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 text-[10px] tracking-wide text-neutral-400 uppercase">
              <span>Name</span>
              <span className="w-16 text-center">Qty</span>
              <span className="w-16 text-right">Price</span>
            </div>
            
            {/* Scrollable Order List */}
            <ul className="min-h-[100px] flex-1 overflow-y-auto px-3 py-1">
              {cart.length === 0 ? (
                <li className="py-6 text-center text-xs text-neutral-400">
                  No items yet.
                </li>
              ) : (
                cart.map((item) => (
                  <li
                    key={item.productId}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-neutral-100 py-1.5 last:border-none"
                  >
                    <span className="min-w-0 truncate text-xs">{item.name}</span>
                    <span className="w-16 text-center text-xs">{item.qty}</span>
                    <span className="w-16 text-right text-xs">
                      {formatMoney(item.price * item.qty)}
                    </span>
                  </li>
                ))
              )}
            </ul>

            {/* Scrollable / Compact Bottom Controls */}
            <div className="shrink-0 max-h-[60vh] overflow-y-auto space-y-2 border-t border-neutral-200 px-3 py-3 text-xs">
              <div>
                <p className="mb-1 text-xs text-neutral-500">Pay with</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`rounded-lg border py-1.5 text-xs transition ${
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
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-500">Amount</span>
                    <input
                      inputMode="numeric"
                      value={tendered}
                      onChange={(event) =>
                        setTendered(event.target.value.replace(/[^\d]/g, ""))
                      }
                      placeholder="0"
                      className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right outline-none focus:border-black"
                    />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTendered(String(total || ""))}
                      className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] hover:border-black"
                    >
                      Exact
                    </button>
                    {CASH_PRESETS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTendered(String(value))}
                        className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] hover:border-black"
                      >
                        {formatMoney(value)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-neutral-500">
                  {paymentLabel(paymentMethod)} · exact {formatMoney(total)}
                </p>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              {discount > 0 && promo ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">{promo.label}</span>
                  <span>−{formatMoney(discount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Total</span>
                <span className="text-base font-semibold">{formatMoney(total)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">{isCash ? "Change" : "Paid"}</span>
                <span>{formatMoney(isCash ? change : total)}</span>
              </div>

              {promoOpen ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {activePromos.length === 0 ? (
                    <p className="col-span-2 text-center text-[11px] text-neutral-500">
                      No active promotions.
                    </p>
                  ) : (
                    activePromos.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setPromoId((current) => (current === item.id ? null : item.id))
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] transition ${
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

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPromoOpen((value) => !value)}
                  className={`rounded-lg border py-2 text-xs transition ${
                    promoId
                      ? "border-black bg-black text-white"
                      : "border-neutral-300 hover:border-black"
                  }`}
                >
                  Promotions
                </button>
                <button
                  type="button"
                  onClick={printTicket}
                  className={`rounded-lg border py-2 text-xs transition ${
                    printer.connected || lastTicket || cart.length > 0
                      ? "border-black bg-black text-white"
                      : "border-neutral-300 hover:border-black"
                  }`}
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoidTargetId(cart.length === 0 ? lastOrderId : null);
                    setVoidModalOpen(true);
                  }}
                  disabled={cart.length === 0 && !lastOrderId}
                  className="rounded-lg border border-neutral-300 py-2 text-xs hover:border-black disabled:opacity-40 transition"
                >
                  Void
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
                    setLastOrderId(result.id ?? null);
                    setCart([]);
                    setTendered("");
                    setPaymentMethod("cash");
                    setPromoId(null);
                    setPromoOpen(false);
                    const receiptCount = drinkReceipts(saved).length;
                    if (printer.connected && receiptCount > 0) {
                      try {
                        await printer.print(saved);
                        setMessage(
                          `Paid ${formatMoney(result.total ?? 0)} · ${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"} printed · tap Print to reprint`,
                        );
                      } catch {
                        setMessage(
                          `Paid ${formatMoney(result.total ?? 0)} · printer failed · tap Print`,
                        );
                      }
                      return;
                    }
                    if (receiptCount === 0) {
                      setMessage(
                        `Paid ${formatMoney(result.total ?? 0)} · no drinks to print`,
                      );
                      return;
                    }
                    setMessage(
                      `Paid ${formatMoney(result.total ?? 0)} · tap Print for last receipt`,
                    );
                  })
                }
                className="relative w-full rounded-xl border-2 border-black py-2.5 text-xs font-medium transition active:scale-[0.99] disabled:opacity-40"
              >
                Proceed Order
              </button>

              {message ? (
                <p className="text-center text-xs text-neutral-500">{message}</p>
              ) : null}
            </div>
          </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
