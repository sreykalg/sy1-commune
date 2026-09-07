import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MenuItem, Order, Promotion, StoreData } from "@/lib/types";
import { DEFAULT_MENU, MENU_CATEGORIES } from "@/lib/menu";
import { DEFAULT_PROMOS } from "@/lib/promos";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");

let queue: Promise<unknown> = Promise.resolve();

function seedOrders(): Order[] {
  const items = [
    { productId: "spanish-latte", name: "Spanish Latte", price: 149 },
    { productId: "seasalt-cream", name: "Sea Salt Cream", price: 159 },
    { productId: "matcha-umami", name: "Matcha Umami", price: 169 },
    { productId: "cookie-crumble", name: "Cookie Crumble", price: 159 },
    { productId: "biscoff-latte", name: "Biscoff Latte", price: 169 },
    { productId: "caramel-macchiato", name: "Caramel Macchiato", price: 159 },
    { productId: "strawberry-crumble", name: "Strawberry Crumble", price: 159 },
    { productId: "panini", name: "Panini", price: 189 },
  ];

  const orders: Order[] = [];
  const now = new Date("2026-09-07T16:00:00+07:00");

  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const count = 4 + ((6 - dayOffset) % 3);
    for (let i = 0; i < count; i += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - dayOffset);
      date.setHours(11 + i, 10 + i * 7, 0, 0);
      const picked = items[(i + dayOffset) % items.length];
      const extra = items[(i + dayOffset + 2) % items.length];
      const qty = 1 + (i % 2);
      const lineItems = [
        {
          productId: picked.productId,
          name: picked.name,
          qty,
          price: picked.price,
        },
      ];
      if (i % 2 === 0) {
        lineItems.push({
          productId: extra.productId,
          name: extra.name,
          qty: 1,
          price: extra.price,
        });
      }
      const total = lineItems.reduce(
        (sum, item) => sum + item.price * item.qty,
        0,
      );
      orders.push({
        id: `ord-${dayOffset}-${i}`,
        createdAt: date.toISOString(),
        baristaName: "Sale In Charge",
        items: lineItems,
        total: Number(total.toFixed(2)),
      });
    }
  }

  return orders;
}

function emptyStore(): StoreData {
  return {
    pos: { isOpen: false, openedAt: null, openedBy: null },
    orders: seedOrders(),
    menu: DEFAULT_MENU.map((item) => ({ ...item })),
    categories: [...MENU_CATEGORIES],
    promotions: DEFAULT_PROMOS.map((item) => ({ ...item })),
  };
}

function uniqueCategories(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const name = value.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function normalizeStore(store: StoreData): StoreData {
  if (!Array.isArray(store.menu) || store.menu.length === 0) {
    store.menu = DEFAULT_MENU.map((item) => ({ ...item }));
  } else {
    store.menu = store.menu.map((item: MenuItem) => ({
      ...item,
      available: item.available !== false,
      image: item.image || "/images/drinks.jpg",
    }));
  }
  store.categories = uniqueCategories([
    ...(store.categories ?? []),
    ...MENU_CATEGORIES,
    ...store.menu.map((item) => item.category),
  ]);
  if (!Array.isArray(store.promotions) || store.promotions.length === 0) {
    store.promotions = DEFAULT_PROMOS.map((item) => ({ ...item }));
  } else {
    store.promotions = store.promotions.map((item: Promotion) => ({
      ...item,
      active: item.active !== false,
      type: item.type === "amount" ? "amount" : "percent",
      value: Number(item.value) || 0,
    }));
  }
  return store;
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    const hadMenu = Array.isArray(parsed.menu) && parsed.menu.length > 0;
    const hadCategories =
      Array.isArray(parsed.categories) && parsed.categories.length > 0;
    const hadPromos =
      Array.isArray(parsed.promotions) && parsed.promotions.length > 0;
    const store = normalizeStore(parsed);
    if (!hadMenu || !hadCategories || !hadPromos) {
      await writeStore(store);
    }
    return store;
  } catch {
    const seeded = emptyStore();
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

async function writeStore(store: StoreData): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function withStore<T>(fn: (store: StoreData) => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore();
    return fn(store);
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getStore(): Promise<StoreData> {
  return withStore((store) => store);
}

export function updateStore(
  fn: (store: StoreData) => void,
): Promise<StoreData> {
  return withStore(async (store) => {
    fn(store);
    await writeStore(store);
    return store;
  });
}
