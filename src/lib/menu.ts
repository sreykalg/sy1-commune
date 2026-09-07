import type { MenuItem } from "@/lib/types";

export const MENU_IMAGES = [
  { label: "Drinks", src: "/images/drinks.jpg" },
  { label: "Cups", src: "/images/cups.jpg" },
  { label: "Signatures", src: "/images/signatures.jpg" },
  { label: "Matcha", src: "/images/matcha-umami.jpg" },
  { label: "Carrier", src: "/images/menu-carrier.jpg" },
  { label: "Food", src: "/images/carrier.jpg" },
  { label: "Logo", src: "/images/logo.jpg" },
] as const;

export const MENU_CATEGORIES = [
  "Coffee",
  "Signature",
  "Tea",
  "Food",
  "Soda",
  "Non Coffee",
] as const;

export const DEFAULT_MENU: MenuItem[] = [
  { id: "spanish-latte", name: "Spanish Latte", price: 149, category: "Coffee", image: "/images/drinks.jpg", available: true },
  { id: "seasalt-cream", name: "Sea Salt Cream", price: 159, category: "Signature", image: "/images/signatures.jpg", available: true },
  { id: "caramel-macchiato", name: "Caramel Macchiato", price: 159, category: "Coffee", image: "/images/drinks.jpg", available: true },
  { id: "biscoff-latte", name: "Biscoff Latte", price: 169, category: "Signature", image: "/images/menu-carrier.jpg", available: true },
  { id: "cookie-crumble", name: "Cookie Crumble", price: 159, category: "Signature", image: "/images/cups.jpg", available: true },
  { id: "strawberry-crumble", name: "Strawberry Crumble", price: 159, category: "Signature", image: "/images/cups.jpg", available: true },
  { id: "matcha-umami", name: "Matcha Umami", price: 169, category: "Tea", image: "/images/matcha-umami.jpg", available: true },
  { id: "panini", name: "Panini", price: 189, category: "Food", image: "/images/carrier.jpg", available: true },
];

export const MENU = DEFAULT_MENU;

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function menuItemId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "item"}-${Date.now().toString(36)}`;
}
