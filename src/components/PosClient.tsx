"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/actions/auth";
import { punchBaristaShift } from "@/actions/users";
import {
  beginPrintJob,
  createOrder,
  finishPrintJob,
  openPos,
  queueReprintJobs,
  requestVoidApproval,
  verifyManager,
  voidCheckout,
  voidOrder,
} from "@/actions/pos";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import {
  SalePurchaseTransactions,
  type InventoryTab,
} from "@/components/SalePurchaseTransactions";
import { drinkStyleLabel, formatMoney, normalizeMenuStyles } from "@/lib/menu";
import { phDateString, phDateTimeLabel } from "@/lib/datetime";
import { PAYMENT_METHODS, parsePayment, paymentLabel } from "@/lib/payments";
import {
  receiptFromOrder,
  type ReceiptTicket,
} from "@/lib/escpos";
import { useLabelPrinter } from "@/lib/label-printer";
import { useReceiptPrinter } from "@/lib/receipt-printer";
import type {
  DrinkStyle,
  MenuItem,
  Order,
  OrderItem,
  PaymentMethod,
  PrintJob,
  PrintJobType,
  PosState,
  Promotion,
  Session,
  StoreData,
  VoidRequest,
} from "@/lib/types";

type PosClientProps = {
  session: Session;
  pos: PosState;
  menu: MenuItem[];
  categories: string[];
  promotions: Promotion[];
  orders: Order[];
  clockedInBaristas: { id: string; name: string; username: string }[];
  printJobs: PrintJob[];
  voidRequests: VoidRequest[];
  inventoryStore: Pick<
    StoreData,
    "orders" | "inventory" | "usageLogs" | "restocks" | "costings"
  >;
};

type PosPanel = "pos" | Extract<InventoryTab, "stock" | "restock">;

const CASH_PRESETS = [500, 1000, 2000];
const CHECKOUT_KEY = "commune_pos_checkout";
const TEST_PRINTER_ENABLED = process.env.NEXT_PUBLIC_TEST_PRINTER === "true";
const PROMOTIONS_ENABLED = false;

type SavedCheckout = {
  userId: string;
  cart: OrderItem[];
  tendered: string;
  paymentMethod: PaymentMethod;
  promoId: string | null;
  voidRequestId: string | null;
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
      const style = item.style === "hot" || item.style === "iced" ? item.style : undefined;
      return [
        {
          productId: product.id,
          name: product.name,
          qty,
          price: product.price,
          style,
        },
      ];
    });

    return {
      userId,
      cart,
      tendered: typeof saved.tendered === "string" ? saved.tendered : "",
      paymentMethod: parsePayment(saved.paymentMethod),
      promoId: typeof saved.promoId === "string" ? saved.promoId : null,
      voidRequestId:
        typeof saved.voidRequestId === "string" ? saved.voidRequestId : null,
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
  clockedInBaristas,
  printJobs,
  voidRequests,
  inventoryStore,
}: PosClientProps) {
  const router = useRouter();
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
  const [activeVoidRequestId, setActiveVoidRequestId] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoId, setPromoId] = useState<string | null>(null);
  const [printOrderId, setPrintOrderId] = useState<string | null>(null);
  const [lastTicket, setLastTicket] = useState<ReceiptTicket | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [localPrintJobs, setLocalPrintJobs] = useState<PrintJob[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [baristaModalOpen, setBaristaModalOpen] = useState(false);
  const [baristaUsername, setBaristaUsername] = useState("");
  const [baristaPassword, setBaristaPassword] = useState("");
  const [baristaNotice, setBaristaNotice] = useState<string | null>(null);
  const [stylePick, setStylePick] = useState<MenuItem | null>(null);
  const [pending, startTransition] = useTransition();
  const labelPrinter = useLabelPrinter();
  const receiptPrinter = useReceiptPrinter();
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [activePanel, setActivePanel] = useState<PosPanel>("pos");
  const activePromos = PROMOTIONS_ENABLED
    ? promotions.filter((item) => item.active)
    : [];
  const appliedPromoId = PROMOTIONS_ENABLED ? promoId : null;
  const availableOrders = useMemo(() => {
    const byId = new Map(orders.map((order) => [order.id, order]));
    if (lastOrder) byId.set(lastOrder.id, lastOrder);
    return [...byId.values()]
      .filter((order) => !order.voided)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [lastOrder, orders]);
  const knownPrintJobs = useMemo(() => {
    const byId = new Map(printJobs.map((job) => [job.id, job]));
    for (const job of localPrintJobs) byId.set(job.id, job);
    return [...byId.values()];
  }, [localPrintJobs, printJobs]);
  const selectedPrintOrder = availableOrders.find(
    (order) => order.id === printOrderId,
  );
  const selectedPrintTicket = selectedPrintOrder
    ? receiptFromOrder(selectedPrintOrder, availableOrders, menu)
    : null;
  const selectedPrintJobs = selectedPrintOrder
    ? knownPrintJobs.filter((job) => job.orderId === selectedPrintOrder.id)
    : [];

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
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const saved = readCheckout(session.userId, menu);
      if (saved) {
        setCart(saved.cart);
        setTendered(saved.tendered);
        setPaymentMethod(saved.paymentMethod);
        setPromoId(PROMOTIONS_ENABLED ? saved.promoId : null);
        setActiveVoidRequestId(saved.voidRequestId);
      }
      setCheckoutReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session.userId, menu]);

  useEffect(() => {
    if (!checkoutReady) return;
    writeCheckout({
      userId: session.userId,
      cart,
      tendered,
      paymentMethod,
      promoId: appliedPromoId,
      voidRequestId: activeVoidRequestId,
    });
  }, [checkoutReady, session.userId, cart, tendered, paymentMethod, appliedPromoId, activeVoidRequestId]);

  useEffect(() => {
    if (
      !promoId ||
      (PROMOTIONS_ENABLED &&
        promotions.some((item) => item.id === promoId && item.active))
    ) {
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setPromoId(null);
    });
    return () => {
      cancelled = true;
    };
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
  const activeVoidRequest = voidRequests.find(
    (request) => request.id === activeVoidRequestId,
  );
  const voidRequestPending =
    Boolean(activeVoidRequestId) && activeVoidRequest?.status !== "approved";
  const canCharge =
    !isManager &&
    !voidRequestPending &&
    pos.isOpen &&
    cart.length > 0 &&
    (!isCash || paid >= total);

  useEffect(() => {
    if (!activeVoidRequestId || activeVoidRequest?.status === "approved") return;
    const refreshTimer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(refreshTimer);
  }, [activeVoidRequest?.status, activeVoidRequestId, router]);

  useEffect(() => {
    if (!activeVoidRequestId || activeVoidRequest?.status !== "approved") return;
    if (activeVoidRequest.orderId) {
      if (lastOrderId === activeVoidRequest.orderId) {
        setLastOrderId(null);
        setLastTicket(null);
        setLastOrder(null);
      }
    } else {
      setCart([]);
      setTendered("");
      setPaymentMethod("cash");
      setPromoId(null);
      setPromoOpen(false);
    }
    setActiveVoidRequestId(null);
    setVoidTargetId(null);
    setVoidReason("");
    setMessage("Admin approved the void. The checkout has been voided.");
  }, [activeVoidRequest, activeVoidRequestId, lastOrderId]);

  function addItem(id: string, name: string, price: number, style?: DrinkStyle) {
    if (!pos.isOpen || isManager || voidRequestPending) {
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.productId === id && item.style === style);
      if (existing) {
        return current.map((item) =>
          item.productId === id && item.style === style ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...current, { productId: id, name, qty: 1, price, style }];
    });
    setMessage(null);
  }

  function handleMenuTap(item: MenuItem) {
    const styles = normalizeMenuStyles(item);
    if (styles.length > 1) {
      setStylePick(item);
      return;
    }
    addItem(item.id, item.name, item.price, styles[0]);
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
          appliedPromoId,
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
      setLastOrder(null);
      setVoidUsername("");
      setVoidPassword("");
      setVoidReason("");
      setVoidTargetId(null);
      setVoidModalOpen(false);
      setMessage("Transaction voided.");
    });
  }

  function handleRequestVoid() {
    if (!voidReason.trim()) {
      setMessage("Enter a reason for voiding.");
      return;
    }
    const targetId = voidTargetId || (cart.length === 0 ? lastOrderId : null);
    if (cart.length === 0 && !targetId) {
      setMessage("No items to void.");
      return;
    }

    startTransition(async () => {
      const result = await requestVoidApproval(
        cart,
        voidReason,
        targetId,
        appliedPromoId,
        paymentMethod,
      );
      if (!result.requestId) {
        setMessage(result.error ?? "Unable to send the void request.");
        return;
      }
      setActiveVoidRequestId(result.requestId);
      setVoidUsername("");
      setVoidPassword("");
      setVoidModalOpen(false);
      setMessage("Void request sent to admin. Waiting for approval.");
    });
  }

  function printTicket() {
    const order =
      (lastOrderId
        ? availableOrders.find((entry) => entry.id === lastOrderId)
        : undefined) ?? availableOrders[0];
    if (!order) {
      setMessage("Complete an order before opening the print flow.");
      return;
    }
    setPrintOrderId(order.id);
  }

  function upsertPrintJobs(updated: PrintJob[]) {
    setLocalPrintJobs((current) => {
      const byId = new Map(current.map((job) => [job.id, job]));
      for (const job of updated) byId.set(job.id, job);
      return [...byId.values()];
    });
  }

  function labelTicketForJob(order: Order, job: PrintJob): ReceiptTicket {
    const ticket = receiptFromOrder(order, availableOrders, menu);
    const source = job.label
      ? order.items[job.label.itemIndex]
      : undefined;
    if (!job.label) return { ...ticket, items: [] };
    return {
      ...ticket,
      items: [
        {
          productId: job.label.productId,
          name: job.label.name,
          price: job.label.price,
          qty: 1,
          category: source?.category,
        },
      ],
    };
  }

  async function attemptPrintJob(job: PrintJob, order: Order): Promise<PrintJob> {
    const started = await beginPrintJob(job.id);
    if ("error" in started) throw new Error(started.error);
    upsertPrintJobs([started.job]);

    let failure: string | undefined;
    try {
      if (job.type === "cup-label") {
        if (!labelPrinter.supported) {
          throw new Error("Web Serial is unavailable for the label printer.");
        }
        if (!labelPrinter.connected) {
          throw new Error("Label printer is disconnected.");
        }
        await labelPrinter.printLabel(labelTicketForJob(order, job));
      } else {
        if (!receiptPrinter.supported) {
          throw new Error("Web Serial is unavailable for the receipt printer.");
        }
        if (!receiptPrinter.connected) {
          throw new Error("Receipt printer is disconnected.");
        }
        await receiptPrinter.printReceipt(
          receiptFromOrder(order, availableOrders, menu),
        );
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "Printer failed.";
    }

    const finished = await finishPrintJob(
      job.id,
      failure ? "failed" : "printed",
      failure,
    );
    if ("error" in finished) throw new Error(finished.error);
    upsertPrintJobs([finished.job]);
    return finished.job;
  }

  async function attemptPrintJobs(jobs: PrintJob[], order: Order) {
    const results: PrintJob[] = [];
    for (const job of jobs) {
      try {
        results.push(await attemptPrintJob(job, order));
      } catch {
        results.push({
          ...job,
          status: "failed",
          lastError: "Could not record the print attempt.",
        });
      }
    }
    return results;
  }

  function printSummary(results: PrintJob[]): string {
    const printed = results.filter((job) => job.status === "printed").length;
    const failed = results.length - printed;
    if (failed === 0) return `${printed} printed`;
    if (printed === 0) return `${failed} waiting for retry`;
    return `${printed} printed, ${failed} waiting for retry`;
  }

  async function printTypeForOrder(order: Order, type: PrintJobType) {
    let jobs = knownPrintJobs.filter(
      (job) =>
        job.orderId === order.id &&
        job.type === type &&
        (job.status === "pending" || job.status === "failed"),
    );
    if (jobs.length === 0) {
      const queued = await queueReprintJobs(order.id, type);
      if ("error" in queued) throw new Error(queued.error);
      jobs = queued.printJobs;
      upsertPrintJobs(jobs);
    }
    const results = await attemptPrintJobs(jobs, order);
    setMessage(
      `${type === "cup-label" ? "Cup labels" : "Customer receipt"}: ${printSummary(results)}.`,
    );
  }

  async function retrySingleJob(job: PrintJob) {
    const order = availableOrders.find((entry) => entry.id === job.orderId);
    if (!order) throw new Error("Completed order not found.");
    const result = await attemptPrintJob(job, order);
    setMessage(
      `${job.type === "cup-label" ? "Cup label" : "Customer receipt"}: ${result.status}.`,
    );
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
              disabled={pending}
              onClick={() => {
                setBaristaUsername("");
                setBaristaPassword("");
                setBaristaNotice(null);
                setBaristaModalOpen(true);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
                clockedInBaristas.length > 0
                  ? "bg-white text-black hover:bg-neutral-200"
                  : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              {clockedInBaristas.length === 0
                ? "Barista in"
                : clockedInBaristas.length === 1
                  ? `In - ${clockedInBaristas[0].name}`
                  : `${clockedInBaristas.length} baristas in`}
            </button>
            <button
              type="button"
              disabled={pending || !labelPrinter.supported}
              onClick={() =>
                startTransition(async () => {
                  try {
                    if (labelPrinter.connected) {
                      await labelPrinter.disconnect();
                      setMessage("Label printer disconnected.");
                      return;
                    }
                    await labelPrinter.connect();
                    setMessage("Label printer connected.");
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : "Label printer error.",
                    );
                  }
                })
              }
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white active:scale-95 disabled:opacity-50"
            >
              {labelPrinter.connected ? "Labels on" : "Connect labels"}
            </button>
            <button
              type="button"
              disabled={pending || !receiptPrinter.supported}
              onClick={() =>
                startTransition(async () => {
                  try {
                    if (receiptPrinter.connected) {
                      await receiptPrinter.disconnect();
                      setMessage("Receipt printer disconnected.");
                      return;
                    }
                    await receiptPrinter.connect();
                    setMessage("Receipt printer connected.");
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : "Receipt printer error.",
                    );
                  }
                })
              }
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white active:scale-95 disabled:opacity-50"
            >
              {receiptPrinter.connected ? "Receipt on" : "Connect receipt"}
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

        {stylePick ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
              <button
                type="button"
                aria-label="Close drink type"
                onClick={() => setStylePick(null)}
                className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-black"
              >
                ×
              </button>
              <h2 className="text-xl font-semibold tracking-tight">{stylePick.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">Choose Iced or Hot.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {normalizeMenuStyles(stylePick).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      addItem(stylePick.id, stylePick.name, stylePick.price, style);
                      setStylePick(null);
                    }}
                    className="rounded-2xl border border-neutral-200 px-4 py-4 text-sm font-medium hover:border-black hover:bg-black hover:text-white"
                  >
                    {drinkStyleLabel(style)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {baristaModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="relative flex w-full max-w-md flex-col rounded-3xl bg-white p-6 shadow-2xl">
              <button
                type="button"
                aria-label="Close barista login"
                onClick={() => setBaristaModalOpen(false)}
                className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-black transition"
              >
                ×
              </button>
              <h2 className="text-xl font-semibold tracking-tight">Baristas</h2>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  startTransition(async () => {
                    const result = await punchBaristaShift({
                      type: "login",
                      username: baristaUsername,
                      password: baristaPassword,
                    });
                    if (result && "error" in result && result.error) {
                      setBaristaNotice(result.error);
                      return;
                    }
                    setBaristaUsername("");
                    setBaristaPassword("");
                    setBaristaNotice(null);
                    setMessage(`${"name" in result ? result.name : "Barista"} clocked in.`);
                    router.refresh();
                  });
                }}
                className="mt-5"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Clock in
                </p>
                <label className="mt-3 block text-xs font-medium text-neutral-600">
                  <span className="mb-1.5 block">Username</span>
                  <input
                    value={baristaUsername}
                    onChange={(event) => setBaristaUsername(event.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-black"
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-neutral-600">
                  <span className="mb-1.5 block">Password</span>
                  <input
                    type="password"
                    value={baristaPassword}
                    onChange={(event) => setBaristaPassword(event.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-black"
                    autoComplete="current-password"
                    required
                  />
                </label>
                {baristaNotice ? <p className="mt-3 text-sm text-red-600">{baristaNotice}</p> : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-5 w-full rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {pending ? "Saving..." : "Clock in"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {!isManager ? (
          <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-neutral-200 bg-white px-4 py-2">
            {(["pos", "stock", "restock"] as const).map((panel) => (
              <button
                key={panel}
                type="button"
                onClick={() => setActivePanel(panel)}
                aria-current={activePanel === panel ? "page" : undefined}
                className={`shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold uppercase transition ${
                  activePanel === panel
                    ? "bg-black text-white"
                    : "border border-neutral-200 bg-white text-neutral-700 hover:border-black"
                }`}
              >
                {panel === "pos" ? "Transactions" : panel === "stock" ? "Stock Inventory" : "Restock"}
              </button>
            ))}
          </nav>
        ) : null}

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
                    : "Manager approval required to void."}
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

              <div className="mt-6 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVoidModalOpen(false)}
                  className="w-1/3 rounded-xl border border-neutral-200 py-2.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || voidRequestPending}
                  className="w-2/3 rounded-xl bg-black py-2.5 text-xs font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
                >
                  {isManager ? "Void ticket" : "Confirm Void"}
                </button>
              </div>
              {!isManager ? (
                <button
                  type="button"
                  disabled={pending || voidRequestPending}
                  onClick={handleRequestVoid}
                  className="mt-2 w-full rounded-xl border border-black py-2.5 text-xs font-medium text-black transition hover:bg-neutral-100 disabled:opacity-40"
                >
                  {voidRequestPending ? "Waiting for admin approval" : "Request to admin"}
                </button>
              ) : null}
            </form>
          </div>
        ) : null}

        {selectedPrintTicket && selectedPrintOrder ? (
          <ReceiptPreview
            ticket={selectedPrintTicket}
            orderId={selectedPrintOrder.id}
            orderOptions={availableOrders.map((order) => ({
              id: order.id,
              label: `#${order.ticketNo ?? order.id.slice(-4)} · ${phDateTimeLabel(order.createdAt)} · ${formatMoney(order.total)}`,
            }))}
            printJobs={selectedPrintJobs}
            labelPaperWidth={labelPrinter.paperWidth}
            receiptPaperWidth={receiptPrinter.paperWidth}
            labelBaudRate={labelPrinter.baudRate}
            receiptBaudRate={receiptPrinter.baudRate}
            labelPrinterReady={labelPrinter.connected}
            receiptPrinterReady={receiptPrinter.connected}
            testPrinterEnabled={TEST_PRINTER_ENABLED}
            pending={pending}
            onClose={() => setPrintOrderId(null)}
            onSelectOrder={setPrintOrderId}
            onSetLabelPaperWidth={labelPrinter.setPaperWidth}
            onSetReceiptPaperWidth={receiptPrinter.setPaperWidth}
            onSetLabelBaudRate={labelPrinter.setBaudRate}
            onSetReceiptBaudRate={receiptPrinter.setBaudRate}
            onPrintLabels={() =>
              startTransition(async () => {
                try {
                  await printTypeForOrder(selectedPrintOrder, "cup-label");
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not print labels.",
                  );
                }
              })
            }
            onPrintReceipt={() =>
              startTransition(async () => {
                try {
                  await printTypeForOrder(selectedPrintOrder, "customer-receipt");
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not print receipt.",
                  );
                }
              })
            }
            onRetryJob={(job) =>
              startTransition(async () => {
                try {
                  await retrySingleJob(job);
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Could not retry print job.",
                  );
                }
              })
            }
          />
        ) : null}

        {!isManager && activePanel !== "pos" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100 p-2 sm:p-4">
            <SalePurchaseTransactions
              store={inventoryStore}
              tabs={["stock", "restock"]}
              activeTab={activePanel}
              onTabChange={(tab) => {
                if (tab === "stock" || tab === "restock") setActivePanel(tab);
              }}
              showTabs={false}
            />
          </div>
        ) : (
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
                      onClick={() => handleMenuTap(item)}
                      disabled={isManager || voidRequestPending}
                      className="rounded-2xl border border-neutral-300 bg-white p-3 text-center transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <p className="text-xs font-medium">{item.name}</p>
                      {normalizeMenuStyles(item).length > 0 ? (
                        <p className="mt-0.5 text-[10px] text-neutral-400">
                          {normalizeMenuStyles(item).map(drinkStyleLabel).join(" / ")}
                        </p>
                      ) : null}
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
                    key={`${item.productId}-${item.style ?? "plain"}`}
                    className="grid grid-cols-[1fr_auto_auto] items-start gap-x-3 border-b border-neutral-100 py-1.5 last:border-none"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs">{item.name}</p>
                      {item.style ? (
                        <p className="text-[10px] text-neutral-600">{drinkStyleLabel(item.style)}</p>
                      ) : null}
                    </div>
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

              {PROMOTIONS_ENABLED && promoOpen ? (
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

              <div
                className={`grid gap-1.5 pt-1 ${
                  PROMOTIONS_ENABLED ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {PROMOTIONS_ENABLED ? (
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
                ) : null}
                <button
                  type="button"
                  onClick={printTicket}
                  className={`rounded-lg border py-2 text-xs transition ${
                    labelPrinter.connected || receiptPrinter.connected || availableOrders.length > 0
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
                  disabled={voidRequestPending || (cart.length === 0 && !lastOrderId)}
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
                    const result = await createOrder(
                      cart,
                      appliedPromoId,
                      paymentMethod,
                      paid,
                    );
                    if (!result.ok) {
                      setMessage(result.error);
                      return;
                    }
                    const savedOrder = result.order;
                    const saved = receiptFromOrder(
                      savedOrder,
                      [savedOrder, ...availableOrders],
                      menu,
                    );
                    setLastTicket(saved);
                    setLastOrder(savedOrder);
                    setLastOrderId(savedOrder.id);
                    upsertPrintJobs(result.printJobs);
                    setCart([]);
                    setTendered("");
                    setPaymentMethod("cash");
                    setPromoId(null);
                    setPromoOpen(false);
                    const labelJobs = result.printJobs.filter(
                      (job) => job.type === "cup-label",
                    );
                    const receiptJobs = result.printJobs.filter(
                      (job) => job.type === "customer-receipt",
                    );
                    const [labelResults, receiptResults] = await Promise.all([
                      attemptPrintJobs(labelJobs, savedOrder),
                      attemptPrintJobs(receiptJobs, savedOrder),
                    ]);
                    setMessage(
                      `Paid ${formatMoney(result.total ?? 0)} · labels: ${printSummary(labelResults)} · receipt: ${printSummary(receiptResults)} · tap Print for details`,
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
              {voidRequestPending ? (
                <p className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-center text-xs font-medium text-neutral-700">
                  Void request pending admin approval
                </p>
              ) : null}
            </div>
          </aside>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
