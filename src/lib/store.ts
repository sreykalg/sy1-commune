import { createClient } from "@supabase/supabase-js";
import type {
  CostingItem,
  InventoryItem,
  LoginActivity,
  MenuItem,
  Order,
  Promotion,
  RecipeIngredient,
  Role,
  StaffUser,
  StoreData,
} from "@/lib/types";
import { CUP_SKUS, cupSkuForItem } from "@/lib/inventory";
import { DEFAULT_MENU, MENU_CATEGORIES, normalizeMenuStyles } from "@/lib/menu";
import { parsePayment } from "@/lib/payments";
import { DEFAULT_LOGIN_GATES, normalizeLoginGates } from "@/lib/staff-gates";
import { DEFAULT_PROMOS } from "@/lib/promos";
import { DEFAULT_USERS, normalizeStaffRole } from "@/lib/users";

const STORE_STATE_ID = "commune-coffee";

let queue: Promise<unknown> = Promise.resolve();

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function supabaseAdmin() {
  const url = env(
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "commume_coffee_SUPABASE_URL",
    "NEXT_PUBLIC_commume_coffee_SUPABASE_URL",
  );
  const key = env(
    "SUPABASE_SECRET_KEY",
    "commume_coffee_SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "commume_coffee_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY_2",
  );

  if (!url || !key) {
    throw new Error(
      "Supabase credentials are missing. Add the real SUPABASE_URL and SUPABASE_SECRET_KEY to .env.local, then restart Next.js.",
    );
  }

  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url)) {
    throw new Error("SUPABASE_URL must be the full https://<project-ref>.supabase.co URL.");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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
        paymentMethod: (["cash", "gcash", "maya"] as const)[i % 3],
      });
    }
  }

  return orders;
}

const DEFAULT_INVENTORY: InventoryItem[] = [
  { id: "coffee-beans", name: "Coffee Beans", category: "Ingredients", unit: "grams", cost: 650, stock: 1000, maxStock: 5000 },
  { id: "milk", name: "Milk", category: "Dairy", unit: "ml", cost: 95, stock: 5000, maxStock: 10000 },
  { id: "sugar", name: "Sugar", category: "Ingredients", unit: "grams", cost: 80, stock: 1000, maxStock: 5000 },
  { id: "cups-peta", name: "Peta Cup", category: "Packaging", unit: "pcs", cost: 3, stock: 200, maxStock: 1000 },
  { id: "cups-daba", name: "Daba Cup", category: "Packaging", unit: "pcs", cost: 3, stock: 200, maxStock: 1000 },
  { id: "cups-hot", name: "Hot Cup", category: "Packaging", unit: "pcs", cost: 3, stock: 200, maxStock: 1000 },
  { id: "matcha-powder", name: "Matcha Powder", category: "Ingredients", unit: "grams", cost: 450, stock: 500, maxStock: 1000 },
];

const DEFAULT_COSTINGS: CostingItem[] = [
  { id: "cost-coffee-beans", productName: "Coffee Beans", ingredients: [{ name: "Coffee Beans", amount: 1000, unit: "grams", outputCups: 55 }] },
  { id: "cost-milk", productName: "Milk", ingredients: [{ name: "Milk", amount: 1000, unit: "ml", outputCups: 75 }] },
  { id: "cost-sugar", productName: "Sugar", ingredients: [{ name: "Sugar", amount: 1000, unit: "grams", outputCups: 100 }] },
  { id: "cost-matcha", productName: "Matcha Powder", ingredients: [{ name: "Matcha Powder", amount: 150, unit: "grams", outputCups: 15 }] },
];

const DEFAULT_RECIPES: Record<string, RecipeIngredient[]> = {};

function emptyStore(): StoreData {
  return {
    pos: { isOpen: false, openedAt: null, openedBy: null },
    orders: seedOrders(),
    printJobs: [],
    menu: DEFAULT_MENU.map((item) => ({ ...item })),
    categories: [...MENU_CATEGORIES],
    promotions: DEFAULT_PROMOS.map((item) => ({ ...item })),
    users: DEFAULT_USERS.map((item) => ({ ...item })),
    inventory: DEFAULT_INVENTORY.map((item) => ({ ...item })),
    recipes: structuredClone(DEFAULT_RECIPES),
    usageLogs: [],
    restocks: [],
    costings: structuredClone(DEFAULT_COSTINGS),
    loginActivity: [],
    offRequests: [],
    voidRequests: [],
    loginGates: { ...DEFAULT_LOGIN_GATES },
  };
}

function isGenericCups(item: InventoryItem) {
  return item.id === "cups" || /^cups?$/i.test(item.name.trim());
}

function cupTemplate(sku: (typeof CUP_SKUS)[number]): InventoryItem {
  return {
    id: sku.id,
    name: sku.name,
    category: "Packaging",
    unit: "pcs",
    cost: 3,
    stock: 200,
    maxStock: 1000,
  };
}

function ensureCupTypes(inventory: InventoryItem[]): InventoryItem[] {
  const generic = inventory.find(isGenericCups);
  const next = inventory
    .filter((item) => !isGenericCups(item))
    .map((item) => {
      const sku = cupSkuForItem(item);
      return sku && item.name !== sku.name ? { ...item, name: sku.name } : item;
    });
  const leftover = generic?.stock ?? 0;
  const missing = CUP_SKUS.filter((sku) => !next.some((item) => cupSkuForItem(item)?.id === sku.id));
  const share = missing.length > 0 ? Math.floor(leftover / missing.length) : 0;
  let remainder = leftover - share * missing.length;

  for (const sku of CUP_SKUS) {
    if (next.some((item) => cupSkuForItem(item)?.id === sku.id)) continue;
    next.push({
      ...cupTemplate(sku),
      stock: share + (remainder > 0 ? 1 : 0),
      maxStock: generic?.maxStock || 1000,
      cost: generic?.cost || 3,
    });
    if (remainder > 0) remainder -= 1;
  }
  return next;
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
  const categoryByProduct = new Map(
    (Array.isArray(store.menu) ? store.menu : []).map((item) => [
      item.id,
      item.category,
    ]),
  );
  if (!Array.isArray(store.orders)) {
    store.orders = [];
  } else {
    store.orders = store.orders.map((order: Order) => ({
      ...order,
      items: Array.isArray(order.items)
        ? order.items.map((item) => ({
            ...item,
            category: item.category ?? categoryByProduct.get(item.productId),
          }))
        : [],
      paymentMethod: parsePayment(order.paymentMethod),
      voided: Boolean(order.voided),
      voidReason: typeof order.voidReason === "string" ? order.voidReason : "",
    }));
  }
  if (!Array.isArray(store.printJobs)) {
    store.printJobs = [];
  } else {
    store.printJobs = store.printJobs.filter(
      (job) =>
        job &&
        typeof job.id === "string" &&
        typeof job.orderId === "string" &&
        (job.type === "cup-label" || job.type === "customer-receipt"),
    );
  }
  if (!Array.isArray(store.menu) || store.menu.length === 0) {
    store.menu = DEFAULT_MENU.map((item) => ({ ...item }));
  } else {
    store.menu = store.menu.map((item: MenuItem) => ({
      ...item,
      available: item.available !== false,
      image: item.image || "/images/drinks.jpg",
      styles: normalizeMenuStyles(item),
    }));
  }
  store.categories = uniqueCategories([
    ...(Array.isArray(store.categories) ? store.categories : []),
    ...store.menu.map((item) => item.category),
  ]);
  if (store.categories.length === 0) {
    store.categories = [...MENU_CATEGORIES];
  }
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
  if (!Array.isArray(store.inventory)) {
    store.inventory = DEFAULT_INVENTORY.map((item) => ({ ...item }));
  } else {
    store.inventory = store.inventory.map((item) => ({
      ...item,
      stock: Number(item.stock) || 0,
      maxStock: Number(item.maxStock) || 0,
      cost: Number(item.cost) || 0,
      unit: item.unit || "pcs",
    }));
    store.inventory = ensureCupTypes(store.inventory);
  }
  if (!store.recipes || typeof store.recipes !== "object") {
    store.recipes = structuredClone(DEFAULT_RECIPES);
  } else {
    const menuIds = new Set(store.menu.map((item) => item.id));
    store.recipes = Object.fromEntries(
      Object.entries(store.recipes)
        .filter(([recipeKey]) => !menuIds.has(recipeKey))
        .map(([recipeName, ingredients]) => [
          recipeName,
          Array.isArray(ingredients)
            ? ingredients.map((ingredient) =>
                ingredient.inventoryItemId === "milk" && Number(ingredient.amount) >= 100
                  ? { ...ingredient, amount: 13.33, unit: "ml" }
                  : ingredient,
              )
            : [],
        ]),
    );
  }
  if (!Array.isArray(store.usageLogs)) {
    store.usageLogs = [];
  } else {
    store.usageLogs = store.usageLogs.map((usage) =>
      /milk/i.test(usage.itemName) && Number(usage.usedAmount) >= 100
        ? { ...usage, usedAmount: Number((Number(usage.usedAmount) / 10).toFixed(2)), unit: "ml" }
        : usage,
    );
  }
  if (!Array.isArray(store.restocks)) {
    store.restocks = [];
  }
  if (!Array.isArray(store.costings)) {
    store.costings = [];
  } else {
    store.costings = store.costings.map((costing) =>
      /milk/i.test(costing.productName) && costing.ingredients.some((ingredient) => /milk/i.test(ingredient.name))
        ? {
            ...costing,
            ingredients: costing.ingredients.map((ingredient) =>
              /milk/i.test(ingredient.name) ? { ...ingredient, amount: 1000, unit: "ml", outputCups: 75 } : ingredient,
            ),
          }
        : costing,
    );
  }
  if (!Array.isArray(store.loginActivity)) {
    store.loginActivity = [];
  }
  if (!Array.isArray(store.offRequests)) {
    store.offRequests = [];
  }
  if (!Array.isArray(store.voidRequests)) {
    store.voidRequests = [];
  } else {
    store.voidRequests = store.voidRequests.filter(
      (request) =>
        request &&
        typeof request.id === "string" &&
        (request.status === "pending" || request.status === "approved") &&
        Array.isArray(request.items),
    );
  }
  store.loginGates = normalizeLoginGates(store.loginGates);

  const matchaInventory = store.inventory.find((item) => /matcha/i.test(item.name));
  const hasMatchaCosting = store.costings.some((costing) =>
    costing.ingredients.some((ingredient) => /matcha/i.test(ingredient.name)),
  );
  if (matchaInventory && !hasMatchaCosting) {
    store.costings.push({
      id: "cost-matcha-powder",
      productName: "Matcha Powder",
      ingredients: [{ name: matchaInventory.name, amount: 150, unit: "grams", outputCups: 15 }],
    });
  }

  if (!Array.isArray(store.users) || store.users.length === 0) {
    store.users = DEFAULT_USERS.map((item) => ({ ...item }));
  } else {
    store.users = store.users.map((item: StaffUser) => ({
      ...item,
      username: String(item.username ?? "").toLowerCase(),
      name: item.name || item.username,
      title: item.title || (item.role === "admin" ? "Owner" : item.role === "manager" ? "Manager" : item.role === "cashier" ? "Cashier" : "Barista"),
      role: normalizeStaffRole({
        role: item.role,
        password: String(item.password ?? ""),
      }),
      password: String(item.password ?? ""),
    }));
    if (!store.users.some((user) => user.role === "manager" && user.password)) {
      const managerUsernameTaken = store.users.some((user) => user.username === "manager");
      store.users.push({
        id: "manager-1",
        username: managerUsernameTaken ? `manager-${Date.now().toString(36)}` : "manager",
        password: "commune",
        name: "Manager",
        role: "manager",
        title: "Manager",
      });
    }
    if (!store.users.some((user) => user.role === "barista" && user.password)) {
      const baristaUsernameTaken = store.users.some((user) => user.username === "barista");
      store.users.push({
        id: "barista-1",
        username: baristaUsernameTaken ? `barista-${Date.now().toString(36)}` : "barista",
        password: "commune",
        name: "Barista",
        role: "barista",
        title: "Barista",
      });
    }
  }
  return store;
}

const MENU_PHOTO_BUCKET = "menu-photos";

export async function uploadPublicMenuPhoto(
  filename: string,
  bytes: Buffer,
  contentType: string,
) {
  const supabase = supabaseAdmin();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Unable to list storage buckets: ${listError.message}`);
  }

  if (!buckets?.some((bucket) => bucket.name === MENU_PHOTO_BUCKET)) {
    const { error } = await supabase.storage.createBucket(MENU_PHOTO_BUCKET, {
      public: true,
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Unable to create photo bucket: ${error.message}`);
    }
  }

  const { error } = await supabase.storage
    .from(MENU_PHOTO_BUCKET)
    .upload(filename, bytes, { contentType, upsert: false });
  if (error) {
    throw new Error(`Unable to upload photo: ${error.message}`);
  }

  const { data } = supabase.storage.from(MENU_PHOTO_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function readStore(): Promise<StoreData> {
  const { data, error } = await supabaseAdmin()
    .from("store_state")
    .select("payload")
    .eq("id", STORE_STATE_ID)
    .maybeSingle();
  if (error) throw new Error(`Unable to read store state: ${error.message}`);
  if (!data?.payload) {
    const store = emptyStore();
    await writeStore(store);
    return store;
  }

  const original = data.payload as StoreData;
  const store = normalizeStore(original);
  const originalCostings = Array.isArray(original.costings) ? original.costings : [];
  const originalRecipes = original.recipes && typeof original.recipes === "object" ? original.recipes : {};
  const originalUsageLogs = Array.isArray(original.usageLogs) ? original.usageLogs : [];
  const originalInventory = Array.isArray(original.inventory) ? original.inventory : [];
  const originalUsers = Array.isArray(original.users) ? original.users : [];
  const originalMenu = Array.isArray(original.menu) ? original.menu : [];
  const originalGates = original.loginGates;
  const menuNeedsStyles = originalMenu.some((item) => {
    const normalized = normalizeMenuStyles(item);
    const current = Array.isArray(item.styles) ? item.styles : [];
    return current.length !== normalized.length || current.some((style, index) => style !== normalized[index]);
  });
  if (
    JSON.stringify(store.costings) !== JSON.stringify(originalCostings) ||
    JSON.stringify(store.recipes) !== JSON.stringify(originalRecipes) ||
    JSON.stringify(store.usageLogs) !== JSON.stringify(originalUsageLogs) ||
    store.inventory.length !== originalInventory.length ||
    store.inventory.some((item) => originalInventory.find((row) => row.id === item.id)?.name !== item.name) ||
    store.users.length !== originalUsers.length ||
    store.users.some((user) => originalUsers.find((item) => item.id === user.id)?.role !== user.role) ||
    store.loginGates.admin !== originalGates?.admin ||
    store.loginGates.cashier !== originalGates?.cashier ||
    menuNeedsStyles
  ) {
    await writeStore(store);
  }
  return store;
}

async function writeStore(store: StoreData): Promise<void> {
  const { error } = await supabaseAdmin().from("store_state").upsert(
    { id: STORE_STATE_ID, payload: store, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Unable to save store state: ${error.message}`);
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

export async function recordAuthActivity(entry: {
  userId: string;
  username: string;
  name: string;
  role: Role;
  type: LoginActivity["type"];
}) {
  if (entry.role === "admin") return;

  await updateStore((store) => {
    if (!Array.isArray(store.loginActivity)) {
      store.loginActivity = [];
    }
    store.loginActivity.unshift({
      id: `auth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      userId: entry.userId,
      username: entry.username,
      name: entry.name,
      role: entry.role,
      type: entry.type,
      at: new Date().toISOString(),
    });
    if (store.loginActivity.length > 300) {
      store.loginActivity.length = 300;
    }
  });
}
