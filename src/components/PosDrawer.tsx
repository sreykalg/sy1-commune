"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { logout } from "@/actions/auth";
import {
  addMenuCategory,
  createMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
  renameMenuCategory,
  setMenuItemAvailable,
  updateMenuItem,
} from "@/actions/menu";
import {
  createPromotion,
  deletePromotion,
  setPromotionActive,
  updatePromotion,
} from "@/actions/promos";
import { closePos, openPos, voidOrder } from "@/actions/pos";
import {
  averageTicket,
  ordersOnDay,
  sumSales,
  topProducts,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/menu";
import { paymentLabel } from "@/lib/payments";
import { promoSummary } from "@/lib/promos";
import { ticketNoForOrder } from "@/lib/escpos";
import type { ReceiptPrinter } from "@/lib/receipt-printer";
import type { MenuItem, Order, PosState, Promotion, Session } from "@/lib/types";

type Panel = "sales" | "menu" | "categories" | "promos" | "history";

type PosDrawerProps = {
  session: Session;
  pos: PosState;
  menu: MenuItem[];
  categories: string[];
  promotions: Promotion[];
  orders: Order[];
  printer: ReceiptPrinter;
  onClose: () => void;
  onReprint: (order: Order) => void;
};

function dayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDay(value: string) {
  return new Date(`${value}T12:00:00`);
}

const field =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black";

export function PosDrawer({
  session,
  pos,
  menu,
  categories,
  promotions,
  orders,
  printer,
  onClose,
  onReprint,
}: PosDrawerProps) {
  const [panel, setPanel] = useState<Panel>("sales");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-40 flex">
      <aside className="flex h-full w-[min(100%,440px)] flex-col bg-neutral-100 text-black shadow-2xl">
        <div className="flex items-center justify-between bg-black px-4 py-3 text-white">
          <div>
            <p className="text-lg font-bold tracking-tight lowercase">commune.</p>
            <p className="text-xs text-neutral-400">{session.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-white" fill="none">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 border-b border-neutral-200 bg-white p-2 sm:grid-cols-5">
          {(
            [
              ["sales", "Sales"],
              ["menu", "Menu"],
              ["categories", "Category"],
              ["promos", "Promo"],
              ["history", "History"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setPanel(id);
                setNotice(null);
              }}
              className={`rounded-lg py-2 text-[11px] sm:text-sm ${
                panel === id ? "bg-black text-white" : "text-neutral-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {panel === "sales" ? <SalesPanel orders={orders} /> : null}
          {panel === "menu" ? (
            <MenuPanel
              menu={menu}
              categories={categories}
              pending={pending}
              notice={notice}
              onNotice={setNotice}
              startTransition={startTransition}
            />
          ) : null}
          {panel === "categories" ? (
            <CategoryPanel
              menu={menu}
              categories={categories}
              pending={pending}
              notice={notice}
              onNotice={setNotice}
              startTransition={startTransition}
            />
          ) : null}
          {panel === "promos" ? (
            <PromoPanel
              promotions={promotions}
              pending={pending}
              notice={notice}
              onNotice={setNotice}
              startTransition={startTransition}
            />
          ) : null}
          {panel === "history" ? (
            <HistoryPanel
              orders={orders}
              pending={pending}
              startTransition={startTransition}
              onNotice={setNotice}
              onReprint={onReprint}
            />
          ) : null}
          {notice && panel !== "menu" && panel !== "categories" && panel !== "promos" ? (
            <p className="mt-3 text-sm text-neutral-500">{notice}</p>
          ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-neutral-200 bg-white p-4">
          <PrinterPanel printer={printer} />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (pos.isOpen) {
                  await closePos();
                } else {
                  await openPos();
                }
                onClose();
              })
            }
            className="w-full rounded-full bg-black py-2.5 text-sm font-medium text-white"
          >
            {pos.isOpen ? "Close POS" : "Open POS"}
          </button>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-full border border-neutral-300 py-2.5 text-sm"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>
      <button
        type="button"
        aria-label="Close menu"
        className="flex-1 bg-black/40"
        onClick={onClose}
      />
    </div>
  );
}

function PrinterPanel({ printer }: { printer: ReceiptPrinter }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const statusLabel =
    printer.status === "connected"
      ? "Connected"
      : printer.status === "unsupported"
        ? "Use Chrome or Edge"
        : "Not connected";

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setNote(null);
    try {
      await action();
      setNote(ok);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Printer error.";
      if (message.toLowerCase().includes("no port selected")) {
        setNote("No printer selected.");
        return;
      }
      setNote(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          Receipt printer
        </p>
        <p className="text-xs text-neutral-500">{statusLabel}</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {([80, 58] as const).map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => printer.setPaperWidth(width)}
            className={`rounded-xl border py-1.5 text-xs ${
              printer.paperWidth === width
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white"
            }`}
          >
            {width}mm
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {printer.connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(printer.disconnect, "Printer disconnected.")}
            className="rounded-xl border border-neutral-300 py-2 text-xs disabled:opacity-40"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !printer.supported}
            onClick={() => run(printer.connect, "Printer connected.")}
            className="rounded-xl bg-black py-2 text-xs text-white disabled:opacity-40"
          >
            Connect
          </button>
        )}
        <button
          type="button"
          disabled={busy || !printer.connected}
          onClick={() => run(printer.testPrint, "Test slip sent.")}
          className="rounded-xl border border-neutral-300 py-2 text-xs disabled:opacity-40"
        >
          Test print
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-neutral-400">
        USB ESC/POS printer. Test print sends a customer copy and a barista copy.
      </p>
      {note ? <p className="mt-2 text-xs text-neutral-500">{note}</p> : null}
    </div>
  );
}

function SalesPanel({ orders }: { orders: Order[] }) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const [picked, setPicked] = useState(dayKey(today));
  const selected = parseDay(picked);
  const todayOrders = ordersOnDay(orders, today);
  const yesterdayOrders = ordersOnDay(orders, yesterday);
  const pickedOrders = ordersOnDay(orders, selected);
  const weekSales = sumSales(orders);
  const tops = topProducts(pickedOrders, 4);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="Today"
          sales={sumSales(todayOrders)}
          tickets={todayOrders.length}
        />
        <SummaryCard
          label="Yesterday"
          sales={sumSales(yesterdayOrders)}
          tickets={yesterdayOrders.length}
        />
      </div>

      <label className="block">
        <span className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          Any day
        </span>
        <input
          type="date"
          value={picked}
          onChange={(event) => setPicked(event.target.value)}
          className={`${field} mt-2`}
        />
      </label>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          {picked}
        </p>
        <p className="mt-2 text-2xl font-semibold">
          {formatMoney(sumSales(pickedOrders))}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {pickedOrders.length} tickets · avg{" "}
          {formatMoney(averageTicket(pickedOrders))}
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {tops.length === 0 ? (
            <li className="text-neutral-400">No sales this day.</li>
          ) : (
            tops.map((item) => (
              <li key={item.name} className="flex justify-between gap-3">
                <span>
                  {item.name} × {item.qty}
                </span>
                <span>{formatMoney(item.sales)}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="text-xs text-neutral-500">
        All recorded sales {formatMoney(weekSales)} · {orders.filter((order) => !order.voided).length} live tickets
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  sales,
  tickets,
}: {
  label: string;
  sales: number;
  tickets: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{formatMoney(sales)}</p>
      <p className="mt-1 text-xs text-neutral-500">{tickets} tickets</p>
    </div>
  );
}

function CategoryPanel({
  menu,
  categories,
  pending,
  notice,
  onNotice,
  startTransition,
}: {
  menu: MenuItem[];
  categories: string[];
  pending: boolean;
  notice: string | null;
  onNotice: (value: string | null) => void;
  startTransition: (fn: () => Promise<void> | void) => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await addMenuCategory(newCategory);
            if (result.error) {
              onNotice(result.error);
              return;
            }
            onNotice("Category added.");
            setNewCategory("");
          });
        }}
      >
        <input
          value={newCategory}
          onChange={(event) => setNewCategory(event.target.value)}
          placeholder="New category"
          className={field}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-xl bg-black px-3 py-2 text-sm text-white"
        >
          Add
        </button>
      </form>

      {notice ? <p className="text-sm text-neutral-500">{notice}</p> : null}

      <ul className="space-y-2">
        {categories.map((category) => {
          const count = menu.filter((item) => item.category === category).length;
          return (
            <li
              key={category}
              className="rounded-2xl border border-neutral-200 bg-white px-3 py-3"
            >
              <div className="flex items-center gap-2">
                {renaming === category ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      startTransition(async () => {
                        const result = await renameMenuCategory(
                          category,
                          renameValue,
                        );
                        if (result.error) {
                          onNotice(result.error);
                          return;
                        }
                        setRenaming(null);
                        onNotice("Category updated.");
                      });
                    }}
                  >
                    <input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      className={field}
                    />
                    <button
                      type="submit"
                      disabled={pending}
                      className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs text-white"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{category}</p>
                    <p className="text-xs text-neutral-500">
                      {count} {count === 1 ? "drink" : "drinks"}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Rename ${category}`}
                  onClick={() => {
                    setRenaming(category);
                    setRenameValue(category);
                    onNotice(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                    <path
                      d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path d="M13.5 6.5l3 3" strokeWidth="1.7" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${category}`}
                  disabled={pending}
                  onClick={() => {
                    if (count > 0) {
                      onNotice(
                        `Move or delete the ${count} ${count === 1 ? "drink" : "drinks"} in ${category} first.`,
                      );
                      return;
                    }
                    startTransition(async () => {
                      const result = await deleteMenuCategory(category);
                      if (result.error) {
                        onNotice(result.error);
                        return;
                      }
                      onNotice("Category deleted.");
                    });
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                    <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" strokeWidth="1.7" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PromoPanel({
  promotions,
  pending,
  notice,
  onNotice,
  startTransition,
}: {
  promotions: Promotion[];
  pending: boolean;
  notice: string | null;
  onNotice: (value: string | null) => void;
  startTransition: (fn: () => Promise<void> | void) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setLabel("");
    setType("percent");
    setValue("");
    setEditingId(null);
  }

  function startEdit(promo: Promotion) {
    setEditingId(promo.id);
    setLabel(promo.label);
    setType(promo.type);
    setValue(String(promo.value));
    onNotice(null);
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(value);
          startTransition(async () => {
            const result = editingId
              ? await updatePromotion({
                  id: editingId,
                  label,
                  type,
                  value: parsed,
                })
              : await createPromotion({ label, type, value: parsed });
            if ("error" in result) {
              onNotice(result.error);
              return;
            }
            onNotice(editingId ? "Promotion updated." : "Promotion added.");
            resetForm();
          });
        }}
      >
        <p className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          {editingId ? "Edit promotion" : "Add promotion"}
        </p>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Senior 20%"
          className={field}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("percent")}
            className={`rounded-xl border py-2 text-xs ${
              type === "percent"
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white"
            }`}
          >
            Percent off
          </button>
          <button
            type="button"
            onClick={() => setType("amount")}
            className={`rounded-xl border py-2 text-xs ${
              type === "amount"
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white"
            }`}
          >
            ₱ amount off
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            step="1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={type === "percent" ? "20" : "50"}
            className={field}
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            {editingId ? "Save" : "Add"}
          </button>
        </div>
        {editingId ? (
          <button
            type="button"
            onClick={resetForm}
            className="text-xs text-neutral-500 underline"
          >
            Cancel edit
          </button>
        ) : null}
      </form>

      {notice ? <p className="text-sm text-neutral-500">{notice}</p> : null}

      {promotions.length === 0 ? (
        <p className="text-sm text-neutral-400">No promotions yet.</p>
      ) : (
        <ul className="space-y-2">
          {promotions.map((promo) => (
            <li
              key={promo.id}
              className="rounded-2xl border border-neutral-200 bg-white px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{promo.label}</p>
                  <p className="text-xs text-neutral-500">
                    {promoSummary(promo)}
                    {promo.active ? "" : " · hidden"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${promo.label}`}
                  onClick={() => startEdit(promo)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                    <path
                      d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path d="M13.5 6.5l3 3" strokeWidth="1.7" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={promo.active ? `Hide ${promo.label}` : `Show ${promo.label}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await setPromotionActive(promo.id, !promo.active);
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black disabled:opacity-40"
                >
                  {promo.active ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                      <path
                        d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
                        strokeWidth="1.7"
                      />
                      <circle cx="12" cy="12" r="2.5" strokeWidth="1.7" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                      <path d="M4 5l16 14" strokeWidth="1.7" />
                      <path
                        d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9M6.5 7.2C4.6 8.6 3 12 3 12s3.5 7 9 7c1.5 0 2.9-.4 4.1-1M17.7 15.5C19.5 14 21 12 21 12s-3.5-7-9-7c-.7 0-1.4.1-2 .2"
                        strokeWidth="1.7"
                      />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${promo.label}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deletePromotion(promo.id);
                      if (editingId === promo.id) resetForm();
                      onNotice("Promotion deleted.");
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                    <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" strokeWidth="1.7" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuPanel({
  menu,
  categories,
  pending,
  notice,
  onNotice,
  startTransition,
}: {
  menu: MenuItem[];
  categories: string[];
  pending: boolean;
  notice: string | null;
  onNotice: (value: string | null) => void;
  startTransition: (fn: () => Promise<void> | void) => void;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [filter, setFilter] = useState("All");
  const grouped = useMemo(() => {
    const extras = menu
      .map((item) => item.category)
      .filter((name) => !categories.includes(name));
    const order = [...categories, ...extras];
    return order
      .filter((category) => filter === "All" || category === filter)
      .map((category) => ({
        category,
        items: menu
          .filter((item) => item.category === category)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) => filter !== "All" || group.items.length > 0);
  }, [menu, categories, filter]);

  const editing =
    editingId === "new"
      ? null
      : menu.find((item) => item.id === editingId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["All", ...categories].map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setFilter(name)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === name
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setEditingId("new");
          onNotice(null);
        }}
        className="w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white"
      >
        Add drink
      </button>

      {editingId ? (
        <ItemForm
          key={editingId}
          item={editing}
          categories={categories}
          defaultCategory={filter === "All" ? categories[0] : filter}
          pending={pending}
          onCancel={() => setEditingId(null)}
          onSave={(formData) =>
            startTransition(async () => {
              const result =
                editingId === "new"
                  ? await createMenuItem(formData)
                  : await updateMenuItem(formData);
              if (result.error) {
                onNotice(result.error);
                return;
              }
              onNotice(editingId === "new" ? "Drink added." : "Item updated.");
              setEditingId(null);
            })
          }
        />
      ) : null}

      {notice ? <p className="text-sm text-neutral-500">{notice}</p> : null}

      {grouped.map(({ category, items }) => (
        <div key={category}>
          <p className="mb-2 text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
            {category}
          </p>
          {items.length === 0 ? (
            <p className="mb-4 text-sm text-neutral-400">No drinks in this category yet.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-neutral-200 bg-white px-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                      <Image
                        src={item.image}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-sm text-neutral-500">
                        {formatMoney(item.price)}
                        {item.available ? "" : " · hidden"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => {
                          setEditingId(item.id);
                          onNotice(null);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                          <path
                            d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                          <path d="M13.5 6.5l3 3" strokeWidth="1.7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={item.available ? `Hide ${item.name}` : `Show ${item.name}`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setMenuItemAvailable(item.id, !item.available);
                          })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black disabled:opacity-40"
                      >
                        {item.available ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                            <path
                              d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
                              strokeWidth="1.7"
                            />
                            <circle cx="12" cy="12" r="2.5" strokeWidth="1.7" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                            <path d="M4 5l16 14" strokeWidth="1.7" />
                            <path
                              d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9M6.5 7.2C4.6 8.6 3 12 3 12s3.5 7 9 7c1.5 0 2.9-.4 4.1-1M17.7 15.5C19.5 14 21 12 21 12s-3.5-7-9-7c-.7 0-1.4.1-2 .2"
                              strokeWidth="1.7"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${item.name}`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await deleteMenuItem(item.id);
                            onNotice("Item deleted.");
                          })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                          <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" strokeWidth="1.7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function ItemForm({
  item,
  categories,
  defaultCategory,
  pending,
  onCancel,
  onSave,
}: {
  item: MenuItem | null;
  categories: string[];
  defaultCategory: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (formData: FormData) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [category, setCategory] = useState(item?.category ?? defaultCategory ?? "Coffee");
  const [addingCategory, setAddingCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(item?.image ?? "");

  return (
    <form
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData();
        if (item) formData.set("id", item.id);
        formData.set("name", name);
        formData.set("price", price);
        formData.set("category", (addingCategory ? customCategory : category).trim());
        if (photo) formData.set("photo", photo);
        onSave(formData);
      }}
    >
      <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-center">
        {preview ? (
          <span className="mb-3 block h-28 w-28 overflow-hidden rounded-2xl">
            <img src={preview} alt="" className="h-28 w-28 object-cover" />
          </span>
        ) : null}
        <span className="text-sm font-medium">
          {preview ? "Change picture" : "Add picture"}
        </span>
        <span className="mt-1 text-xs text-neutral-500">JPG, PNG, or WEBP</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setPhoto(file);
            if (file) {
              setPreview(URL.createObjectURL(file));
            }
          }}
        />
      </label>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Drink name"
        className={field}
      />
      <input
        inputMode="numeric"
        value={price}
        onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))}
        placeholder="Price"
        className={field}
      />
      <select
        value={addingCategory ? "new" : category}
        onChange={(event) => {
          if (event.target.value === "new") {
            setAddingCategory(true);
            return;
          }
          setAddingCategory(false);
          setCustomCategory("");
          setCategory(event.target.value);
        }}
        className={field}
      >
        {categories.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
        <option value="new">New category</option>
      </select>
      {addingCategory ? (
        <input
          value={customCategory}
          onChange={(event) => setCustomCategory(event.target.value)}
          placeholder="New category name"
          className={field}
        />
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-black py-2 text-sm text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-neutral-300 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function HistoryPanel({
  orders,
  pending,
  startTransition,
  onNotice,
  onReprint,
}: {
  orders: Order[];
  pending: boolean;
  startTransition: (fn: () => Promise<void> | void) => void;
  onNotice: (value: string | null) => void;
  onReprint: (order: Order) => void;
}) {
  const [picked, setPicked] = useState(dayKey(new Date()));
  const tickets = [...ordersOnDay(orders, parseDay(picked))].reverse();
  const allForDay = [...orders]
    .filter((order) => {
      const created = new Date(order.createdAt);
      return dayKey(created) === picked;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          Tickets for
        </span>
        <input
          type="date"
          value={picked}
          onChange={(event) => setPicked(event.target.value)}
          className={`${field} mt-2`}
        />
      </label>
      <p className="text-sm text-neutral-500">
        {formatMoney(sumSales(tickets))} · {tickets.length} tickets
      </p>
      <ul className="space-y-2">
        {allForDay.length === 0 ? (
          <li className="text-sm text-neutral-400">No tickets this day.</li>
        ) : (
          allForDay.map((order) => (
            <li
              key={order.id}
              className="rounded-2xl border border-neutral-200 bg-white p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={order.voided ? "text-neutral-400 line-through" : "font-medium"}>
                    {formatMoney(order.total)}
                    <span className="ml-2 font-normal text-neutral-500">
                      #{ticketNoForOrder(orders, order)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {` · ${paymentLabel(order.paymentMethod)}`}
                    {order.voided ? " · voided" : ""}
                  </p>
                  <p className="mt-2 text-neutral-600">
                    {order.items
                      .map((item) => `${item.qty}× ${item.name}`)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Print order ${ticketNoForOrder(orders, order)}`}
                    onClick={() => onReprint(order)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-black"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                      <path d="M7 8V4h10v4" strokeWidth="1.7" />
                      <path
                        d="M6 18H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-1"
                        strokeWidth="1.7"
                      />
                      <path d="M6 14h12v6H6z" strokeWidth="1.7" />
                    </svg>
                  </button>
                  {!order.voided ? (
                    <button
                      type="button"
                      aria-label={`Void order ${ticketNoForOrder(orders, order)}`}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await voidOrder(order.id);
                          onNotice(result.error ?? "Ticket voided.");
                        })
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                        <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" strokeWidth="1.7" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
