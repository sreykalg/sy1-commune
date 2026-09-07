"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { menuItemId } from "@/lib/menu";
import { updateStore } from "@/lib/store";

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function requireBarista() {
  const session = await getSession();
  if (!session || session.role !== "barista") {
    throw new Error("Only the barista can edit the menu.");
  }
  return session;
}

function refresh() {
  revalidatePath("/pos");
  revalidatePath("/admin");
  revalidatePath("/");
}

function isSafeImage(src: string) {
  return src.startsWith("/images/") || src.startsWith("/uploads/menu/");
}

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function saveMenuPhoto(file: File, id: string) {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) {
    return { error: "Use a JPG, PNG, WEBP, or GIF photo." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "Keep photos under 5MB." };
  }

  const safeId = id.replace(/[^a-z0-9-]/gi, "") || "item";
  const filename = `${safeId}-${Date.now().toString(36)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "menu");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return { src: `/uploads/menu/${filename}` };
}

function photoFromForm(formData: FormData) {
  const photo = formData.get("photo");
  return photo instanceof File && photo.size > 0 ? photo : null;
}

export async function addMenuCategory(name: string) {
  await requireBarista();
  const category = name.trim();
  if (!category) {
    return { error: "Enter a category name." };
  }

  let error: string | undefined;
  await updateStore((store) => {
    const exists = store.categories.some(
      (entry) => entry.toLowerCase() === category.toLowerCase(),
    );
    if (exists) {
      error = "That category is already on the board.";
      return;
    }
    store.categories.push(category);
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function renameMenuCategory(from: string, to: string) {
  await requireBarista();
  const prev = from.trim();
  const next = to.trim();
  if (!prev) return { error: "Category not found." };
  if (!next) return { error: "Enter a category name." };

  let error: string | undefined;
  await updateStore((store) => {
    const taken = store.categories.some(
      (entry) =>
        entry.toLowerCase() === next.toLowerCase() &&
        entry.toLowerCase() !== prev.toLowerCase(),
    );
    if (taken) {
      error = "That category is already on the board.";
      return;
    }

    let renamed = false;
    store.categories = store.categories.map((entry) => {
      if (entry.toLowerCase() !== prev.toLowerCase()) return entry;
      renamed = true;
      return next;
    });
    if (!renamed) {
      store.categories.push(next);
    }
    for (const item of store.menu) {
      if (item.category.toLowerCase() === prev.toLowerCase()) {
        item.category = next;
      }
    }
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function deleteMenuCategory(name: string) {
  await requireBarista();
  const category = name.trim();
  if (!category) return { error: "Category not found." };

  let error: string | undefined;
  await updateStore((store) => {
    const inUse = store.menu.some(
      (item) => item.category.toLowerCase() === category.toLowerCase(),
    );
    if (inUse) {
      error = "Move or delete drinks in this category first.";
      return;
    }
    store.categories = store.categories.filter(
      (entry) => entry.toLowerCase() !== category.toLowerCase(),
    );
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function createMenuItem(formData: FormData) {
  await requireBarista();
  const name = readText(formData, "name");
  const category = readText(formData, "category");
  const price = Number(readText(formData, "price"));
  const photo = photoFromForm(formData);

  if (!name || !category) {
    return { error: "Name and category are required." };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Enter a valid price." };
  }

  const id = menuItemId(name);
  let image = "/images/drinks.jpg";
  if (photo) {
    const saved = await saveMenuPhoto(photo, id);
    if ("error" in saved && saved.error) return { error: saved.error };
    if ("src" in saved) image = saved.src;
  }

  await updateStore((store) => {
    if (!store.categories.some((entry) => entry.toLowerCase() === category.toLowerCase())) {
      store.categories.push(category);
    }
    store.menu.push({
      id,
      name,
      price: Math.round(price),
      category,
      image,
      available: true,
    });
  });
  refresh();
  return { ok: true };
}

export async function updateMenuItem(formData: FormData) {
  await requireBarista();
  const id = readText(formData, "id");
  const name = readText(formData, "name");
  const category = readText(formData, "category");
  const price = Number(readText(formData, "price"));
  const photo = photoFromForm(formData);

  if (!id) return { error: "Item not found." };
  if (!name || !category) {
    return { error: "Name and category are required." };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Enter a valid price." };
  }

  let uploaded: string | undefined;
  if (photo) {
    const saved = await saveMenuPhoto(photo, id);
    if ("error" in saved && saved.error) return { error: saved.error };
    if ("src" in saved) uploaded = saved.src;
  }

  let error: string | undefined;
  await updateStore((store) => {
    const item = store.menu.find((entry) => entry.id === id);
    if (!item) {
      error = "Item not found.";
      return;
    }
    item.name = name;
    item.price = Math.round(price);
    item.category = category;
    if (uploaded) {
      item.image = uploaded;
    } else if (!isSafeImage(item.image)) {
      item.image = "/images/drinks.jpg";
    }
    if (!store.categories.some((entry) => entry.toLowerCase() === category.toLowerCase())) {
      store.categories.push(category);
    }
  });
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function setMenuItemAvailable(id: string, available: boolean) {
  await requireBarista();
  await updateStore((store) => {
    const item = store.menu.find((entry) => entry.id === id);
    if (item) item.available = available;
  });
  refresh();
  return { ok: true };
}

export async function deleteMenuItem(id: string) {
  await requireBarista();
  await updateStore((store) => {
    store.menu = store.menu.filter((item) => item.id !== id);
  });
  refresh();
  return { ok: true };
}
