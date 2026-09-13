import { phDateString, phTimestamp } from "@/lib/datetime";
import type {
  CostingIngredient,
  CostingItem,
  InventoryItem,
  MenuItem,
  OrderItem,
  RecipeIngredient,
  StoreData,
} from "@/lib/types";

export function roundQty(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatQty(value: number): string {
  const rounded = roundQty(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function itemKey(name: string) {
  return name.trim().toLowerCase();
}

export function namesMatch(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function stockLedgerForDate(input: {
  itemName: string;
  liveStock: number;
  date: string;
  restocks: { itemName: string; quantityAdded: number; date: string }[];
  usages: { itemName: string; usedAmount: number; date: string }[];
}): { opening: number; restocked: number; used: number; remaining: number } {
  return stockLedgerForRange({ ...input, from: input.date, to: input.date });
}

export function stockLedgerForRange(input: {
  itemName: string;
  liveStock: number;
  from: string;
  to: string;
  restocks: { itemName: string; quantityAdded: number; date: string }[];
  usages: { itemName: string; usedAmount: number; date: string }[];
}): { opening: number; restocked: number; used: number; remaining: number } {
  const from = input.from <= input.to ? input.from : input.to;
  const to = input.from <= input.to ? input.to : input.from;
  const afterEnd = (value: string) => phDateString(value) > to;
  const inRange = (value: string) => {
    const day = phDateString(value);
    return day >= from && day <= to;
  };

  const sumRestocks = (
    rows: { itemName: string; quantityAdded: number; date: string }[],
    matchesDate: (value: string) => boolean,
  ) =>
    roundQty(
      rows
        .filter((row) => namesMatch(row.itemName, input.itemName) && matchesDate(row.date))
        .reduce((sum, row) => sum + (Number(row.quantityAdded) || 0), 0),
    );

  const sumUsages = (
    rows: { itemName: string; usedAmount: number; date: string }[],
    matchesDate: (value: string) => boolean,
  ) =>
    roundQty(
      rows
        .filter((row) => namesMatch(row.itemName, input.itemName) && matchesDate(row.date))
        .reduce((sum, row) => sum + (Number(row.usedAmount) || 0), 0),
    );

  const restocked = sumRestocks(input.restocks, inRange);
  const used = sumUsages(input.usages, inRange);
  const remaining = roundQty(
    Math.max(0, input.liveStock - sumRestocks(input.restocks, afterEnd) + sumUsages(input.usages, afterEnd)),
  );
  const opening = roundQty(remaining - restocked + used);
  return { opening, restocked, used, remaining };
}

export function remainingForUsages(
  usages: { date: string; itemName: string; usedAmount: number }[],
  restocks: { date: string; itemName: string; quantityAdded: number }[],
  inventory: { name: string; stock: number }[],
): number[] {
  const stock = new Map<string, number>();
  for (const item of inventory) {
    stock.set(itemKey(item.name), item.stock);
  }

  type LedgerEvent =
    | { kind: "usage"; at: string; key: string; qty: number; index: number }
    | { kind: "restock"; at: string; key: string; qty: number; index: number };

  const events: LedgerEvent[] = [];
  usages.forEach((usage, index) => {
    events.push({
      kind: "usage",
      at: usage.date,
      key: itemKey(usage.itemName),
      qty: usage.usedAmount,
      index,
    });
  });
  restocks.forEach((restock, index) => {
    events.push({
      kind: "restock",
      at: restock.date,
      key: itemKey(restock.itemName),
      qty: restock.quantityAdded,
      index: usages.length + index,
    });
  });

  events.sort((a, b) => phTimestamp(b.at) - phTimestamp(a.at) || b.index - a.index);

  const remaining = usages.map(() => 0);
  for (const event of events) {
    const current = stock.get(event.key) ?? 0;
    if (event.kind === "usage") {
      remaining[event.index] = roundQty(Math.max(0, current));
      stock.set(event.key, current + event.qty);
    } else {
      stock.set(event.key, Math.max(0, current - event.qty));
    }
  }
  return remaining;
}

export function perCupAmount(ing: Pick<CostingIngredient, "amount" | "outputCups">): number {
  const amount = Number(ing.amount) || 0;
  const cups = Number(ing.outputCups) || 0;
  if (amount <= 0) return 0;
  if (cups > 0) return amount / cups;
  return amount;
}

export function cupsFromQuantity(
  quantity: number,
  ing: Pick<CostingIngredient, "amount" | "outputCups">,
): number {
  const perCup = perCupAmount(ing);
  if (perCup <= 0) return 0;
  return quantity / perCup;
}

export function findCostingForItem(costings: CostingItem[], name: string): CostingItem | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return costings.find((costing) => {
    if (costing.productName.toLowerCase() === needle) return true;
    return costing.ingredients.some((ing) => {
      const ingName = ing.name.trim().toLowerCase();
      return ingName === needle || ingName.includes(needle) || needle.includes(ingName);
    });
  });
}

export function costingIngredientForItem(
  costings: CostingItem[],
  name: string,
): CostingIngredient | undefined {
  const costing = findCostingForItem(costings, name);
  if (!costing) return undefined;
  const needle = name.trim().toLowerCase();
  return (
    costing.ingredients.find((ing) => ing.name.trim().toLowerCase() === needle) ??
    costing.ingredients[0]
  );
}

export const CUP_SKUS = [
  { id: "cups-peta", name: "Peta Cup" },
  { id: "cups-daba", name: "Daba Cup" },
  { id: "cups-hot", name: "Hot Cup" },
] as const;

export function cupSkuForItem(item: { id?: string; name: string }) {
  const id = item.id ?? "";
  const name = item.name.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  for (const sku of CUP_SKUS) {
    if (id === sku.id) return sku;
    const stem = sku.name.replace(/ cup$/i, "").toLowerCase();
    if (
      name === stem ||
      name === `${stem} cup` ||
      name === `${stem} cups` ||
      name === `cups ${stem}` ||
      name === `cups - ${stem}`
    ) {
      return sku;
    }
  }
  return null;
}

function findInventory(
  inventory: InventoryItem[],
  tester: (item: InventoryItem) => boolean,
): InventoryItem | undefined {
  return inventory.find(tester);
}

function isCoffeeCategory(category: string) {
  const value = category.replace(/-/g, " ").toLowerCase();
  return value === "special" || value === "classic";
}

function isMatchaDrink(name: string, category: string) {
  return /matcha/i.test(category) || /matcha|hojicha/i.test(name);
}

function isDrinkCategory(category: string) {
  const value = category.toLowerCase();
  return !/food|pastr/.test(value);
}

function isMilkDrink(category: string) {
  const value = category.replace(/-/g, " ").toLowerCase();
  return value.includes("non coffee") || value.includes("fresh");
}

function cupForDrink(
  category: string,
  peta?: InventoryItem,
  daba?: InventoryItem,
  hot?: InventoryItem,
) {
  const value = category.replace(/-/g, " ").toLowerCase();
  if (value === "classic") return hot ?? peta ?? daba;
  if (value.includes("fresh")) return daba ?? peta ?? hot;
  return peta ?? daba ?? hot;
}

export function ingredientsForOrderLine(store: StoreData, line: OrderItem): RecipeIngredient[] {
  const menuItem = store.menu.find((item) => item.id === line.productId);
  const name = menuItem?.name || line.name;
  const category = menuItem?.category || "";
  const ingredients: RecipeIngredient[] = [];

  function addInventory(item: InventoryItem | undefined, amount: number, unit?: string) {
    if (!item || amount <= 0) return;
    ingredients.push({
      inventoryItemId: item.id,
      name: item.name,
      amount,
      unit: unit || item.unit || "pcs",
    });
  }

  function addByCosting(item: InventoryItem | undefined, fallbackPerCup: number) {
    if (!item) return;
    const recipe = costingIngredientForItem(store.costings, item.name);
    addInventory(item, recipe ? perCupAmount(recipe) : fallbackPerCup, recipe?.unit || item.unit);
  }

  const beans = findInventory(
    store.inventory,
    (item) => item.id === "coffee-beans" || /coffee bean/i.test(item.name),
  );
  const milk = findInventory(store.inventory, (item) => item.id === "milk" || /^milk$/i.test(item.name));
  const matcha = findInventory(
    store.inventory,
    (item) => item.id === "matcha-powder" || /matcha/i.test(item.name),
  );
  const sugar = findInventory(
    store.inventory,
    (item) => item.id === "sugar" || /^sugar$/i.test(item.name),
  );
  const peta = findInventory(store.inventory, (item) => cupSkuForItem(item)?.id === "cups-peta");
  const daba = findInventory(store.inventory, (item) => cupSkuForItem(item)?.id === "cups-daba");
  const hot = findInventory(store.inventory, (item) => cupSkuForItem(item)?.id === "cups-hot");

  if (isMatchaDrink(name, category)) {
    addByCosting(matcha, 10);
    addByCosting(sugar, 10);
  } else if (isCoffeeCategory(category)) {
    addByCosting(beans, 18);
    addByCosting(milk, 1000 / 7.5);
    addByCosting(sugar, 10);
  } else if (isMilkDrink(category)) {
    addByCosting(milk, 1000 / 7.5);
    addByCosting(sugar, 10);
  }

  if (isDrinkCategory(category)) {
    addInventory(cupForDrink(category, peta, daba, hot), 1, "pcs");
  }

  return ingredients;
}

export function recipeForMenuPreview(store: StoreData, item: MenuItem): RecipeIngredient[] {
  return ingredientsForOrderLine(store, {
    productId: item.id,
    name: item.name,
    qty: 1,
    price: item.price,
  });
}
