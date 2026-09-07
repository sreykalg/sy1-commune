"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { promoId } from "@/lib/promos";
import { updateStore } from "@/lib/store";
import type { Promotion } from "@/lib/types";

async function requireBarista() {
  const session = await getSession();
  if (!session || session.role !== "barista") {
    throw new Error("Only the barista can edit promotions.");
  }
  return session;
}

function refresh() {
  revalidatePath("/pos");
  revalidatePath("/admin");
}

function parsePromo(input: {
  label: string;
  type: string;
  value: number;
}): { error: string } | Omit<Promotion, "id" | "active"> {
  const label = input.label.trim();
  const type = input.type === "amount" ? "amount" : "percent";
  const value = Number(input.value);

  if (!label) return { error: "Enter a promotion name." };
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "Enter a valid discount." };
  }
  if (type === "percent" && value > 100) {
    return { error: "Percent off cannot exceed 100." };
  }

  return { label, type, value: Math.round(value) };
}

export async function createPromotion(input: {
  label: string;
  type: string;
  value: number;
}) {
  await requireBarista();
  const parsed = parsePromo(input);
  if ("error" in parsed) return parsed;

  await updateStore((store) => {
    store.promotions.push({
      id: promoId(parsed.label),
      ...parsed,
      active: true,
    });
  });
  refresh();
  return { ok: true };
}

export async function updatePromotion(input: {
  id: string;
  label: string;
  type: string;
  value: number;
}) {
  await requireBarista();
  const parsed = parsePromo(input);
  if ("error" in parsed) return parsed;

  let error: string | undefined;
  await updateStore((store) => {
    const promo = store.promotions.find((entry) => entry.id === input.id);
    if (!promo) {
      error = "Promotion not found.";
      return;
    }
    promo.label = parsed.label;
    promo.type = parsed.type;
    promo.value = parsed.value;
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function setPromotionActive(id: string, active: boolean) {
  await requireBarista();
  await updateStore((store) => {
    const promo = store.promotions.find((entry) => entry.id === id);
    if (promo) promo.active = active;
  });
  refresh();
  return { ok: true };
}

export async function deletePromotion(id: string) {
  await requireBarista();
  await updateStore((store) => {
    store.promotions = store.promotions.filter((entry) => entry.id !== id);
  });
  refresh();
  return { ok: true };
}
