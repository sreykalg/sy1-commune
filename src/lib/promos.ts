import type { Promotion } from "@/lib/types";

export const DEFAULT_PROMOS: Promotion[] = [
  { id: "senior", label: "Senior 20%", type: "percent", value: 20, active: true },
  { id: "pwd", label: "PWD 20%", type: "percent", value: 20, active: true },
  { id: "ten", label: "10% off", type: "percent", value: 10, active: true },
  { id: "fifty", label: "₱50 off", type: "amount", value: 50, active: true },
];

export function promoId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "promo"}-${Date.now().toString(36)}`;
}

export function promoSummary(promo: Promotion): string {
  return promo.type === "percent" ? `${promo.value}% off` : `₱${promo.value} off`;
}
