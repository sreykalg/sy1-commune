"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { nextTicketNo } from "@/lib/escpos";
import { pricedOrderLine } from "@/lib/menu";
import { parsePayment } from "@/lib/payments";
import { ingredientsForOrderLine, roundQty } from "@/lib/inventory";
import { canUsePos } from "@/lib/users";
import { getStore, updateStore } from "@/lib/store";
import type { OrderItem, StoreData } from "@/lib/types";

async function requirePos() {
  const session = await getSession();
  if (!session || !canUsePos(session.role)) {
    throw new Error("Only POS staff can use the POS.");
  }
  return session;
}

async function requireCashier() {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    throw new Error("Only a cashier can take orders.");
  }
  return session;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Only an admin can change store records.");
  }
}

export async function saveAdminData(data: {
  inventory?: StoreData["inventory"];
  restocks?: StoreData["restocks"];
  costings?: StoreData["costings"];
  usageLogs?: StoreData["usageLogs"];
  orders?: StoreData["orders"];
}) {
  await requireAdmin();
  await updateStore((store) => {
    if (data.inventory) store.inventory = data.inventory;
    if (data.restocks) store.restocks = data.restocks;
    if (data.costings) store.costings = data.costings;
    if (data.usageLogs) store.usageLogs = data.usageLogs;
    if (data.orders) store.orders = data.orders;
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteAdminRecord(kind: "order" | "inventory" | "restock" | "costing", id: string) {
  await requireAdmin();
  await updateStore((store) => {
    if (kind === "order") {
      store.orders = store.orders.filter((order) => order.id !== id);
      store.usageLogs = store.usageLogs.filter((entry) => entry.orderId !== id);
    } else if (kind === "inventory") {
      store.inventory = store.inventory.filter((item) => item.id !== id);
    } else if (kind === "restock") {
      store.restocks = store.restocks.filter((record) => record.id !== id);
    } else {
      store.costings = store.costings.filter((record) => record.id !== id);
    }
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function openPos() {
  const session = await requirePos();
  await updateStore((store) => {
    store.pos = {
      isOpen: true,
      openedAt: new Date().toISOString(),
      openedBy: session.name,
    };
  });
  revalidatePath("/pos");
  revalidatePath("/admin");
}

export async function closePos() {
  await requirePos();
  await updateStore((store) => {
    store.pos = {
      isOpen: false,
      openedAt: null,
      openedBy: null,
    };
  });
  revalidatePath("/pos");
  revalidatePath("/admin");
}

export async function createOrder(
  cart: OrderItem[],
  promoId?: string | null,
  paymentMethod?: string | null,
  tendered?: number | null,
) {
  const session = await requireCashier();

  if (cart.length === 0) {
    return { error: "Add a drink before charging." };
  }

  const priced: OrderItem[] = [];
  let error: string | undefined;
  let charged = 0;
  let ticketNo = "";
  let createdId = "";

  await updateStore((store) => {
    if (!store.pos.isOpen) {
      error = "Open the POS before taking orders.";
      return;
    }

    for (const line of cart) {
      const menuItem = store.menu.find((item) => item.id === line.productId);
      const qty = Number(line.qty);
      if (!menuItem || !menuItem.available) {
        error = "One of the items is no longer on the menu.";
        return;
      }
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) {
        error = "Each item quantity must be a whole number from 1 to 99.";
        return;
      }
      priced.push(pricedOrderLine(menuItem, { ...line, qty }));
    }

    const requestedStock = new Map<string, number>();
    for (const line of priced) {
      for (const ingredient of ingredientsForOrderLine(store, line)) {
        const inventory = store.inventory.find(
          (item) =>
            item.id === ingredient.inventoryItemId ||
            item.name.toLowerCase() === ingredient.name.toLowerCase(),
        );
        if (inventory) {
          requestedStock.set(
            inventory.id,
            (requestedStock.get(inventory.id) ?? 0) + ingredient.amount * line.qty,
          );
        }
      }
    }
    for (const [inventoryId, requested] of requestedStock) {
      const inventory = store.inventory.find((item) => item.id === inventoryId);
      if (inventory && inventory.stock < requested) {
        error = `Not enough ${inventory.name} in stock.`;
        return;
      }
    }

    const subtotal = priced.reduce((sum, item) => sum + item.price * item.qty, 0);
    let discount = 0;
    let promoLabel: string | undefined;
    if (promoId) {
      const found = store.promotions.find(
        (entry) => entry.id === promoId && entry.active,
      );
      if (!found) {
        error = "That promotion is no longer available.";
        return;
      }
      promoLabel = found.label;
      discount =
        found.type === "percent"
          ? Math.round((subtotal * found.value) / 100)
          : Math.min(subtotal, Math.round(found.value));
    }
    const total = Math.max(0, subtotal - discount);
    const method = parsePayment(paymentMethod);
    const cashIn =
      method === "cash" ? Math.max(0, Math.round(Number(tendered) || 0)) : total;
    if (method === "cash" && cashIn < total) {
      error = "Cash tendered is short.";
      return;
    }
    charged = total;
    ticketNo = nextTicketNo(store.orders);
    const orderId = `ord-${Date.now()}`;
    createdId = orderId;
    const createdAt = new Date().toISOString();
    const usageByItem = new Map<string, StoreData["usageLogs"][number]>();

    for (const line of priced) {
      const ingredients = ingredientsForOrderLine(store, line);
      for (const ingredient of ingredients) {
        const amount = roundQty(ingredient.amount * line.qty);
        const inventory = store.inventory.find((item) =>
          item.id === ingredient.inventoryItemId || item.name.toLowerCase() === ingredient.name.toLowerCase(),
        );
        if (!inventory) continue;
        inventory.stock = roundQty(Math.max(0, inventory.stock - amount));
        const existing = usageByItem.get(inventory.id);
        if (existing) {
          existing.usedAmount = roundQty(existing.usedAmount + amount);
          existing.remaining = inventory.stock;
        } else {
          usageByItem.set(inventory.id, {
            id: `${orderId}-${inventory.id}-${usageByItem.size}`,
            orderId,
            orderItemId: line.productId,
            date: createdAt,
            itemName: inventory.name,
            usedAmount: amount,
            unit: ingredient.unit,
            remaining: inventory.stock,
          });
        }
      }
    }
    store.usageLogs = [
      ...store.usageLogs.filter((entry) => entry.orderId !== orderId),
      ...usageByItem.values(),
    ];

    store.orders.push({
      id: orderId,
      createdAt,
      baristaName: session.name,
      items: priced,
      subtotal,
      discount,
      promoLabel,
      total,
      paymentMethod: method,
      ticketNo,
      paid: cashIn,
      change: method === "cash" ? cashIn - total : 0,
      voided: false,
    });
  });

  if (error) return { error };

  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true, total: charged, ticketNo, id: createdId };
}

export async function verifyManager(username: string, password: string) {
  await requirePos();
  const store = await getStore();
  const user = store.users.find(
    (entry) =>
      entry.role === "manager" &&
      entry.username === username.trim().toLowerCase() &&
      Boolean(entry.password) &&
      entry.password === password,
  );
  if (!user) {
    return { error: "Manager credentials required to void." };
  }
  return { ok: true, name: user.name };
}

export async function voidOrder(
  orderId: string,
  reason: string,
  managerUsername?: string,
  managerPassword?: string,
) {
  const session = await requirePos();
  if (!reason.trim()) {
    return { error: "Enter a reason for voiding." };
  }

  if (session.role === "cashier") {
    const auth = await verifyManager(managerUsername ?? "", managerPassword ?? "");
    if ("error" in auth) return auth;
  } else if (session.role !== "manager") {
    return { error: "Only a manager can void a transaction." };
  }

  let error: string | undefined;

  await updateStore((store) => {
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order) {
      error = "Ticket not found.";
      return;
    }
    order.voided = true;
    order.voidReason = reason.trim();
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true };
}

export async function voidCheckout(
  cart: OrderItem[],
  reason: string,
  managerUsername: string,
  managerPassword: string,
  promoId?: string | null,
  paymentMethod?: string | null,
) {
  const session = await requireCashier();
  if (!reason.trim()) {
    return { error: "Enter a reason for voiding." };
  }
  if (cart.length === 0) {
    return { error: "No items to void." };
  }

  const auth = await verifyManager(managerUsername, managerPassword);
  if ("error" in auth) return auth;

  let error: string | undefined;
  let createdId = "";

  await updateStore((store) => {
    const priced: OrderItem[] = [];
    for (const line of cart) {
      const menuItem = store.menu.find((item) => item.id === line.productId);
      const qty = Number(line.qty);
      if (!menuItem) {
        error = "One of the items is no longer on the menu.";
        return;
      }
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) {
        error = "Each item quantity must be a whole number from 1 to 99.";
        return;
      }
      priced.push(pricedOrderLine(menuItem, { ...line, qty }));
    }

    const subtotal = priced.reduce((sum, item) => sum + item.price * item.qty, 0);
    let discount = 0;
    let promoLabel: string | undefined;
    if (promoId) {
      const found = store.promotions.find((entry) => entry.id === promoId && entry.active);
      if (found) {
        promoLabel = found.label;
        discount =
          found.type === "percent"
            ? Math.round((subtotal * found.value) / 100)
            : Math.min(subtotal, Math.round(found.value));
      }
    }
    const total = Math.max(0, subtotal - discount);
    const orderId = `ord-${Date.now()}`;
    createdId = orderId;
    store.orders.push({
      id: orderId,
      createdAt: new Date().toISOString(),
      baristaName: session.name,
      items: priced,
      subtotal,
      discount,
      promoLabel,
      total,
      paymentMethod: parsePayment(paymentMethod),
      ticketNo: nextTicketNo(store.orders),
      paid: 0,
      change: 0,
      voided: true,
      voidReason: reason.trim(),
    });
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true, id: createdId };
}

export async function requestVoidApproval(input: {
  reason: string;
  orderId?: string | null;
  cart?: OrderItem[];
  promoId?: string | null;
  paymentMethod?: string | null;
}) {
  const session = await requireCashier();
  const reason = input.reason.trim();
  if (!reason) {
    return { error: "Enter a reason for voiding." };
  }

  const cart = Array.isArray(input.cart) ? input.cart : [];
  let error: string | undefined;

  await updateStore((store) => {
    if (!Array.isArray(store.voidRequests)) store.voidRequests = [];

    if (cart.length > 0) {
      const items = cart.flatMap((line) => {
        const qty = Number(line.qty);
        if (!Number.isSafeInteger(qty) || qty < 1) return [];
        return [{ productId: line.productId, name: line.name, qty, price: line.price, style: line.style }];
      });
      if (items.length === 0) {
        error = "No items to void.";
        return;
      }
      store.voidRequests.unshift({
        id: `voidreq-${Date.now().toString(36)}`,
        kind: "checkout",
        cashierId: session.userId,
        cashierName: session.name,
        reason,
        items,
        total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
        promoId: input.promoId ?? null,
        paymentMethod: parsePayment(input.paymentMethod),
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const orderId = input.orderId?.trim();
    if (!orderId) {
      error = "No ticket to void.";
      return;
    }
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order) {
      error = "Ticket not found.";
      return;
    }
    if (order.voided) {
      error = "That ticket is already voided.";
      return;
    }
    if (store.voidRequests.some((entry) => entry.status === "pending" && entry.orderId === orderId)) {
      error = "A void request for this ticket is already waiting.";
      return;
    }
    store.voidRequests.unshift({
      id: `voidreq-${Date.now().toString(36)}`,
      kind: "order",
      orderId: order.id,
      ticketNo: order.ticketNo,
      cashierId: session.userId,
      cashierName: session.name,
      reason,
      items: order.items,
      total: order.total,
      paymentMethod: order.paymentMethod,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true };
}

export async function setVoidRequestStatus(id: string, status: "approved" | "denied") {
  await requireAdmin();
  let error: string | undefined;

  await updateStore((store) => {
    if (!Array.isArray(store.voidRequests)) store.voidRequests = [];
    const request = store.voidRequests.find((entry) => entry.id === id);
    if (!request) {
      error = "Void request not found.";
      return;
    }
    if (request.status !== "pending") {
      error = "That request was already handled.";
      return;
    }
    if (status === "denied") {
      request.status = "denied";
      return;
    }

    if (request.kind === "order" && request.orderId) {
      const order = store.orders.find((entry) => entry.id === request.orderId);
      if (!order) {
        error = "Ticket not found.";
        return;
      }
      order.voided = true;
      order.voidReason = request.reason;
    } else {
      store.orders.push({
        id: `ord-${Date.now()}`,
        createdAt: request.createdAt,
        baristaName: request.cashierName,
        items: request.items,
        subtotal: request.total,
        discount: 0,
        total: request.total,
        paymentMethod: request.paymentMethod ?? "cash",
        ticketNo: nextTicketNo(store.orders),
        paid: 0,
        change: 0,
        voided: true,
        voidReason: request.reason,
      });
    }
    request.status = "approved";
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteVoidRequest(id: string) {
  await requireAdmin();
  await updateStore((store) => {
    store.voidRequests = (store.voidRequests ?? []).filter((entry) => entry.id !== id);
  });
  revalidatePath("/admin");
  return { ok: true };
}
