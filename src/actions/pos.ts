"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isDrinkCategory, nextTicketNo } from "@/lib/escpos";
import { pricedOrderLine } from "@/lib/menu";
import { parsePayment } from "@/lib/payments";
import { ingredientsForOrderLine, roundQty } from "@/lib/inventory";
import { canUsePos } from "@/lib/users";
import { getStore, updateStore } from "@/lib/store";
import type {
  MenuItem,
  Order,
  OrderItem,
  PrintJob,
  PrintJobStatus,
  PrintJobType,
  StoreData,
} from "@/lib/types";

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
  return session;
}

async function requireInventoryAccess(hasAdminOnlyData: boolean) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "admin" && session.role !== "cashier") ||
    (session.role === "cashier" && hasAdminOnlyData)
  ) {
    throw new Error("You do not have permission to change these store records.");
  }
  return session;
}

function markOrderVoided(store: StoreData, orderId: string, reason: string) {
  const order = store.orders.find((entry) => entry.id === orderId);
  if (!order) return "Ticket not found.";
  if (order.voided) return "Ticket is already voided.";

  order.voided = true;
  order.voidReason = reason;
  const updatedAt = new Date().toISOString();
  for (const job of store.printJobs) {
    if (
      job.orderId === orderId &&
      (job.status === "pending" || job.status === "failed")
    ) {
      job.status = "cancelled";
      job.updatedAt = updatedAt;
      job.lastError = "Order was voided.";
    }
  }
}

function labelJobsForOrder(
  order: Order,
  menu: MenuItem[],
  idPrefix: string,
  createdAt: string,
): PrintJob[] {
  const categoryByProduct = new Map(menu.map((item) => [item.id, item.category]));
  let labelIndex = 0;

  return order.items.flatMap((item, itemIndex) => {
    const category = item.category ?? categoryByProduct.get(item.productId);
    if (!isDrinkCategory(category)) return [];

    return Array.from({ length: item.qty }, (_, copyIndex) => {
      labelIndex += 1;
      return {
        id: `${idPrefix}-label-${labelIndex}`,
        orderId: order.id,
        type: "cup-label" as const,
        status: "pending" as const,
        attempts: 0,
        createdAt,
        updatedAt: createdAt,
        label: {
          productId: item.productId,
          name: item.name,
          price: item.price,
          itemIndex,
          copyIndex,
          copiesForItem: item.qty,
        },
      };
    });
  });
}

function initialPrintJobs(order: Order, menu: MenuItem[]): PrintJob[] {
  const createdAt = order.createdAt;
  return [
    ...labelJobsForOrder(order, menu, order.id, createdAt),
    {
      id: `${order.id}-receipt`,
      orderId: order.id,
      type: "customer-receipt",
      status: "pending",
      attempts: 0,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function reprintId(orderId: string, type: PrintJobType): string {
  return `${orderId}-${type}-reprint-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export async function saveAdminData(data: {
  inventory?: StoreData["inventory"];
  restocks?: StoreData["restocks"];
  costings?: StoreData["costings"];
  usageLogs?: StoreData["usageLogs"];
  orders?: StoreData["orders"];
}) {
  await requireInventoryAccess(data.costings !== undefined || data.orders !== undefined);
  await updateStore((store) => {
    if (data.inventory) store.inventory = data.inventory;
    if (data.restocks) store.restocks = data.restocks;
    if (data.costings) store.costings = data.costings;
    if (data.usageLogs) store.usageLogs = data.usageLogs;
    if (data.orders) store.orders = data.orders;
  });
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteAdminRecord(kind: "order" | "inventory" | "restock" | "costing", id: string) {
  await requireInventoryAccess(kind === "order" || kind === "costing");
  await updateStore((store) => {
    if (kind === "order") {
      store.orders = store.orders.filter((order) => order.id !== id);
      store.printJobs = store.printJobs.filter((job) => job.orderId !== id);
      store.usageLogs = store.usageLogs.filter((entry) => entry.orderId !== id);
    } else if (kind === "inventory") {
      store.inventory = store.inventory.filter((item) => item.id !== id);
    } else if (kind === "restock") {
      store.restocks = store.restocks.filter((record) => record.id !== id);
    } else {
      store.costings = store.costings.filter((record) => record.id !== id);
    }
  });
  revalidatePath("/pos");
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
    return { ok: false as const, error: "Add a drink before charging." };
  }

  const priced: OrderItem[] = [];
  let error: string | undefined;
  let charged = 0;
  let ticketNo = "";
  let createdId = "";
  let createdOrder: Order | null = null;
  let createdPrintJobs: PrintJob[] = [];

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

    createdOrder = {
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
    };
    createdPrintJobs = initialPrintJobs(createdOrder, store.menu);
    store.orders.push(createdOrder);
    store.printJobs.push(...createdPrintJobs);
  });

  if (error) return { ok: false as const, error };

  revalidatePath("/pos");
  revalidatePath("/admin");
  return {
    ok: true as const,
    total: charged,
    ticketNo,
    id: createdId,
    order: createdOrder!,
    printJobs: createdPrintJobs,
  };
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
    error = markOrderVoided(store, orderId, reason.trim());
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true };
}

export async function requestVoidApproval(
  cart: OrderItem[],
  reason: string,
  orderId?: string | null,
  promoId?: string | null,
  paymentMethod?: string | null,
) {
  const session = await requireCashier();
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "Enter a reason for voiding." };

  let error: string | undefined;
  let requestId = "";

  await updateStore((store) => {
    if (
      store.voidRequests.some(
        (request) =>
          request.requestedById === session.userId && request.status === "pending",
      )
    ) {
      error = "You already have a void request waiting for admin approval.";
      return;
    }

    const existingOrder = orderId
      ? store.orders.find((order) => order.id === orderId)
      : undefined;
    if (orderId && !existingOrder) {
      error = "Ticket not found.";
      return;
    }
    if (existingOrder?.voided) {
      error = "Ticket is already voided.";
      return;
    }

    let items: OrderItem[] = [];
    let subtotal = 0;
    let discount = 0;
    let promoLabel: string | undefined;
    let total = 0;
    let requestedPayment = parsePayment(paymentMethod);

    if (existingOrder) {
      items = existingOrder.items.map((item) => ({ ...item }));
      subtotal = existingOrder.subtotal ?? existingOrder.total;
      discount = existingOrder.discount ?? 0;
      promoLabel = existingOrder.promoLabel;
      total = existingOrder.total;
      requestedPayment = parsePayment(existingOrder.paymentMethod);
    } else {
      if (cart.length === 0) {
        error = "No items to void.";
        return;
      }
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
        items.push(pricedOrderLine(menuItem, { ...line, qty }));
      }
      subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const promotion = promoId
        ? store.promotions.find((entry) => entry.id === promoId && entry.active)
        : undefined;
      if (promotion) {
        promoLabel = promotion.label;
        discount =
          promotion.type === "percent"
            ? Math.round((subtotal * promotion.value) / 100)
            : Math.min(subtotal, Math.round(promotion.value));
      }
      total = Math.max(0, subtotal - discount);
    }

    requestId = `void-request-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    store.voidRequests.unshift({
      id: requestId,
      requestedAt: new Date().toISOString(),
      requestedById: session.userId,
      requestedByName: session.name,
      reason: trimmedReason,
      status: "pending",
      orderId: existingOrder?.id,
      items,
      subtotal,
      discount,
      promoLabel,
      total,
      paymentMethod: requestedPayment,
    });
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true, requestId };
}

export async function approveVoidRequest(requestId: string) {
  const session = await requireAdmin();
  let error: string | undefined;

  await updateStore((store) => {
    const request = store.voidRequests.find((entry) => entry.id === requestId);
    if (!request) {
      error = "Void request not found.";
      return;
    }
    if (request.status !== "pending") {
      error = "Void request is already approved.";
      return;
    }

    if (request.orderId) {
      error = markOrderVoided(store, request.orderId, request.reason);
      if (error) return;
      request.processedOrderId = request.orderId;
    } else {
      const createdAt = new Date().toISOString();
      const createdId = `ord-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      store.orders.push({
        id: createdId,
        createdAt,
        baristaName: request.requestedByName,
        items: request.items.map((item) => ({ ...item })),
        subtotal: request.subtotal,
        discount: request.discount,
        promoLabel: request.promoLabel,
        total: request.total,
        paymentMethod: request.paymentMethod,
        ticketNo: nextTicketNo(store.orders),
        paid: 0,
        change: 0,
        voided: true,
        voidReason: request.reason,
      });
      request.processedOrderId = createdId;
    }

    request.status = "approved";
    request.approvedAt = new Date().toISOString();
    request.approvedByName = session.name;
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

export async function beginPrintJob(jobId: string) {
  await requirePos();
  let error: string | undefined;
  let updated: PrintJob | null = null;

  await updateStore((store) => {
    const job = store.printJobs.find((entry) => entry.id === jobId);
    const order = job
      ? store.orders.find((entry) => entry.id === job.orderId)
      : undefined;
    if (!job || !order) {
      error = "Print job not found.";
      return;
    }
    if (order.voided || job.status === "cancelled") {
      error = "A voided order cannot be printed.";
      return;
    }
    if (job.status === "printed") {
      error = "This print job has already succeeded.";
      return;
    }

    job.attempts += 1;
    job.status = "pending";
    job.updatedAt = new Date().toISOString();
    delete job.lastError;
    updated = { ...job, label: job.label ? { ...job.label } : undefined };
  });

  if (error || !updated) return { error: error ?? "Unable to start print job." };
  revalidatePath("/pos");
  return { ok: true, job: updated };
}

export async function finishPrintJob(
  jobId: string,
  status: Extract<PrintJobStatus, "printed" | "failed">,
  message?: string,
) {
  await requirePos();
  if (status !== "printed" && status !== "failed") {
    return { error: "Invalid print job status." };
  }
  let error: string | undefined;
  let updated: PrintJob | null = null;

  await updateStore((store) => {
    const job = store.printJobs.find((entry) => entry.id === jobId);
    if (!job) {
      error = "Print job not found.";
      return;
    }
    if (job.status === "cancelled") {
      error = "A cancelled print job cannot be updated.";
      return;
    }

    const now = new Date().toISOString();
    job.status = status;
    job.updatedAt = now;
    if (status === "printed") {
      job.printedAt = now;
      delete job.lastError;
    } else {
      job.lastError = (message || "Printer failed.").trim().slice(0, 240);
    }
    updated = { ...job, label: job.label ? { ...job.label } : undefined };
  });

  if (error || !updated) return { error: error ?? "Unable to update print job." };
  revalidatePath("/pos");
  return { ok: true, job: updated };
}

export async function queueReprintJobs(
  orderId: string,
  type: PrintJobType,
  sourceLabelJobId?: string,
) {
  await requirePos();
  if (type !== "cup-label" && type !== "customer-receipt") {
    return { error: "Invalid print job type." };
  }
  let error: string | undefined;
  let created: PrintJob[] = [];

  await updateStore((store) => {
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order || order.voided) {
      error = "Completed order not found.";
      return;
    }

    const createdAt = new Date().toISOString();
    if (type === "customer-receipt") {
      created = [
        {
          id: reprintId(order.id, type),
          orderId: order.id,
          type,
          status: "pending",
          attempts: 0,
          createdAt,
          updatedAt: createdAt,
        },
      ];
    } else if (sourceLabelJobId) {
      const source = store.printJobs.find(
        (job) =>
          job.id === sourceLabelJobId &&
          job.orderId === order.id &&
          job.type === "cup-label" &&
          job.label,
      );
      if (!source?.label) {
        error = "Cup label job not found.";
        return;
      }
      created = [
        {
          id: reprintId(order.id, type),
          orderId: order.id,
          type,
          status: "pending",
          attempts: 0,
          createdAt,
          updatedAt: createdAt,
          label: { ...source.label },
        },
      ];
    } else {
      created = labelJobsForOrder(
        order,
        store.menu,
        reprintId(order.id, type),
        createdAt,
      );
      if (created.length === 0) {
        error = "This order has no cup labels.";
        return;
      }
    }

    store.printJobs.push(...created);
  });

  if (error) return { error };
  revalidatePath("/pos");
  return { ok: true, printJobs: created };
}
