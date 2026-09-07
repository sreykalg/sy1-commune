import type { MenuItem } from "@/lib/types";

export const MENU: MenuItem[] = [
  { id: "spanish-latte", name: "Spanish Latte", price: 149, category: "Coffee" },
  { id: "seasalt-cream", name: "Sea Salt Cream", price: 159, category: "Signature" },
  { id: "caramel-macchiato", name: "Caramel Macchiato", price: 159, category: "Coffee" },
  { id: "biscoff-latte", name: "Biscoff Latte", price: 169, category: "Signature" },
  { id: "cookie-crumble", name: "Cookie Crumble", price: 159, category: "Signature" },
  { id: "strawberry-crumble", name: "Strawberry Crumble", price: 159, category: "Signature" },
  { id: "matcha-umami", name: "Matcha Umami", price: 169, category: "Tea" },
  { id: "panini", name: "Panini", price: 189, category: "Food" },
];

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}
