"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { parsePayment } from "@/lib/payments";
import { updateStore } from "@/lib/store";
import type { OrderItem } from "@/lib/types";

async function requireBarista() {
  const session = await getSession();
  if (!session || session.role !== "barista") {
    throw new Error("Only the barista can use the POS.");
  }
  return session;
}

export async function openPos() {
  const session = await requireBarista();
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
  await requireBarista();
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
) {
  const session = await requireBarista();

  if (cart.length === 0) {
    return { error: "Add a drink before charging." };
  }

  const priced: OrderItem[] = [];
  let error: string | undefined;
  let charged = 0;

  await updateStore((store) => {
    if (!store.pos.isOpen) {
      error = "Open the POS before taking orders.";
      return;
    }

    for (const line of cart) {
      const menuItem = store.menu.find((item) => item.id === line.productId);
      if (!menuItem || !menuItem.available) {
        error = "One of the items is no longer on the menu.";
        return;
      }
      priced.push({
        productId: menuItem.id,
        name: menuItem.name,
        qty: Math.max(1, Math.floor(line.qty)),
        price: menuItem.price,
      });
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
    charged = total;

    store.orders.push({
      id: `ord-${Date.now()}`,
      createdAt: new Date().toISOString(),
      baristaName: session.name,
      items: priced,
      subtotal,
      discount,
      promoLabel,
      total,
      paymentMethod: parsePayment(paymentMethod),
    });
  });

  if (error) return { error };

  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true, total: charged };
}

export async function voidOrder(orderId: string) {
  await requireBarista();
  let error: string | undefined;

  await updateStore((store) => {
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order) {
      error = "Ticket not found.";
      return;
    }
    order.voided = true;
  });

  if (error) return { error };
  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true };
}
