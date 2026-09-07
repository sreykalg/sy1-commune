"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { MENU } from "@/lib/menu";
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

export async function createOrder(cart: OrderItem[]) {
  const session = await requireBarista();

  if (cart.length === 0) {
    return { error: "Add a drink before charging." };
  }

  const priced: OrderItem[] = cart.map((line) => {
    const menuItem = MENU.find((item) => item.id === line.productId);
    if (!menuItem) {
      throw new Error("Unknown menu item.");
    }
    return {
      productId: menuItem.id,
      name: menuItem.name,
      qty: Math.max(1, Math.floor(line.qty)),
      price: menuItem.price,
    };
  });

  const total = Number(
    priced
      .reduce((sum, item) => sum + item.price * item.qty, 0)
      .toFixed(2),
  );

  let error: string | undefined;

  await updateStore((store) => {
    if (!store.pos.isOpen) {
      error = "Open the POS before taking orders.";
      return;
    }
    store.orders.push({
      id: `ord-${Date.now()}`,
      createdAt: new Date().toISOString(),
      baristaName: session.name,
      items: priced,
      total,
    });
  });

  if (error) return { error };

  revalidatePath("/pos");
  revalidatePath("/admin");
  return { ok: true, total };
}
