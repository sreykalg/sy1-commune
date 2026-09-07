import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import type { MenuItem, Order, Promotion, StaffUser, StoreData } from "@/lib/types";
import { DEFAULT_MENU, MENU_CATEGORIES } from "@/lib/menu";
import { DEFAULT_PROMOS } from "@/lib/promos";
import { DEFAULT_USERS } from "@/lib/users";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");
const BLOB_STORE_KEY = "commune/store.json";

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
    users: DEFAULT_USERS.map((item) => ({ ...item })),
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
  if (!Array.isArray(store.users) || store.users.length === 0) {
    store.users = DEFAULT_USERS.map((item) => ({ ...item }));
  } else {
    store.users = store.users.map((item: StaffUser) => ({
      ...item,
      username: String(item.username ?? "").toLowerCase(),
      name: item.name || item.username,
      title: item.title || (item.role === "admin" ? "Owner" : "Barista"),
      role: item.role === "admin" ? "admin" : "barista",
      password: String(item.password ?? ""),
    }));
  }
  return store;
}

export function usesBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function readFileStore(): Promise<StoreData | null> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoreData;
  } catch {
    return null;
  }
}

async function writeFileStore(store: StoreData) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

async function readBlobStore(): Promise<StoreData | null> {
  try {
    const result = await get(BLOB_STORE_KEY, {
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    const raw = await new Response(result.stream).text();
    return JSON.parse(raw) as StoreData;
  } catch {
    return null;
  }
}

async function writeBlobStore(store: StoreData) {
  await put(BLOB_STORE_KEY, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readStore(): Promise<StoreData> {
  if (usesBlobStorage()) {
    const fromBlob = await readBlobStore();
    if (fromBlob) return normalizeStore(fromBlob);
    const bundled = await readFileStore();
    const seeded = normalizeStore(bundled ?? emptyStore());
    await writeBlobStore(seeded);
    return seeded;
  }

  const fromFile = await readFileStore();
  if (!fromFile) {
    const seeded = emptyStore();
    await writeFileStore(seeded);
    return seeded;
  }
  const hadMenu = Array.isArray(fromFile.menu) && fromFile.menu.length > 0;
  const hadCategories =
    Array.isArray(fromFile.categories) && fromFile.categories.length > 0;
  const hadPromos =
    Array.isArray(fromFile.promotions) && fromFile.promotions.length > 0;
  const hadUsers = Array.isArray(fromFile.users) && fromFile.users.length > 0;
  const store = normalizeStore(fromFile);
  if (!hadMenu || !hadCategories || !hadPromos || !hadUsers) {
    await writeFileStore(store);
  }
  return store;
}

async function writeStore(store: StoreData): Promise<void> {
  if (usesBlobStorage()) {
    await writeBlobStore(store);
    return;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Connect a Vercel Blob store to this project so POS data can save.",
    );
  }
  await writeFileStore(store);
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
