"use client";

import { useState, useEffect } from "react";

type StockItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
  stock: number;
  maxStock: number;
  totalUsed?: number;
  totalStock?: number;
};

export function StockManager({ title = "Inventory Management" }: { title?: string }) {
  // Basahin ang nakaraang data mula sa localStorage kapag nag-load ang page
  const [stocks, setStocks] = useState<StockItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cafe_stocks_data");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse stocks from localStorage", e);
        }
      }
    }
    // Default initial items kung wala pang naka-save
    return [
      { id: "1", name: "Coffee Beans", category: "Ingredients", unit: "kg", cost: 650, stock: 5, maxStock: 20 },
      { id: "2", name: "Milk", category: "Dairy", unit: "liters", cost: 95, stock: 10, maxStock: 50 },
      { id: "3", name: "Matcha Powder", category: "Ingredients", unit: "grams", cost: 450, stock: 300, maxStock: 500 },
      { id: "4", name: "Peta Cup", category: "Packaging", unit: "pcs", cost: 3, stock: 150, maxStock: 500 },
      { id: "4b", name: "Daba Cup", category: "Packaging", unit: "pcs", cost: 3, stock: 150, maxStock: 500 },
      { id: "4c", name: "Hot Cup", category: "Packaging", unit: "pcs", cost: 3, stock: 150, maxStock: 500 },
    ];
  });

  // I-save sa localStorage tuwing magbabago ang stocks (pag nag-add o nag-delete)
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cafe_stocks_data", JSON.stringify(stocks));
    }
  }, [stocks]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [restockQuantities, setRestockQuantities] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editMaxStock, setEditMaxStock] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category || !unit || !cost || !stock || !maxStock) return;

    const newItem: StockItem = {
      id: Date.now().toString(),
      name,
      category,
      unit,
      cost: Number(cost),
      stock: Number(stock),
      maxStock: Number(maxStock),
    };

    setStocks([...stocks, newItem]);

    setName("");
    setCategory("");
    setUnit("");
    setCost("");
    setStock("");
    setMaxStock("");
  };

  const handleDelete = (id: string) => {
    setStocks(stocks.filter((item) => item.id !== id));
  };

  const handleRestock = (id: string) => {
    const quantity = Number(restockQuantities[id]);
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    setStocks((currentStocks) => currentStocks.map((item) => {
      if (item.id !== id) return item;
      const totalStock = (item.totalStock ?? item.stock + (item.totalUsed ?? 0)) + quantity;
      return { ...item, stock: item.stock + quantity, totalStock };
    }));
    setRestockQuantities((current) => ({ ...current, [id]: "" }));
  };

  const startEdit = (item: StockItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditCost(item.cost.toString());
    setEditStock(item.stock.toString());
    setEditMaxStock(item.maxStock.toString());
  };

  const handleUpdate = (id: string) => {
    setStocks(
      stocks.map((item) =>
        item.id === id
          ? {
              ...item,
              name: editName,
              category: editCategory,
              unit: editUnit,
              cost: Number(editCost),
              stock: Number(editStock),
              maxStock: Number(editMaxStock),
            }
          : item
      )
    );
    setEditingId(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-neutral-500 text-sm">Pamahalaan ang mga sangkap at gamit kasama ang cost at status percentage.</p>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
        <input
          type="text"
          placeholder="Item Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <input
          type="text"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <input
          type="text"
          placeholder="Unit (kg, L, pcs)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <input
          type="number"
          placeholder="Cost (₱)"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <input
          type="number"
          placeholder="Current Stock"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <input
          type="number"
          placeholder="Max Capacity"
          value={maxStock}
          onChange={(e) => setMaxStock(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 md:col-span-7">
          Add Inventory Item
        </button>
      </form>

      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
              <th className="p-4">Item Name</th>
              <th className="p-4">Category</th>
              <th className="p-4 text-right">Remaining Stock</th>
              <th className="p-4 text-right">Total Used</th>
              <th className="p-4 text-right">Total Stock</th>
              <th className="p-4 text-center">Restock</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((item) => {
              const percentage = item.maxStock > 0 ? Math.min(Math.round((item.stock / item.maxStock) * 100), 100) : 0;

              return (
                <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                  {editingId === item.id ? (
                    <>
                      <td className="p-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="border border-neutral-300 rounded px-2 py-1 text-sm w-full"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="border border-neutral-300 rounded px-2 py-1 text-sm w-full"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          value={editStock}
                          onChange={(e) => setEditStock(e.target.value)}
                          className="border border-neutral-300 rounded px-2 py-1 text-sm w-20 text-right"
                        />
                      </td>
                      <td className="p-3 text-right text-neutral-500">{item.totalUsed ?? 0}</td>
                      <td className="p-3 text-right font-semibold">{item.totalStock ?? item.stock + (item.totalUsed ?? 0)}</td>
                      <td className="p-3 text-center text-xs text-neutral-400">
                        <input
                          type="number"
                          placeholder="Max"
                          value={editMaxStock}
                          onChange={(e) => setEditMaxStock(e.target.value)}
                          className="border border-neutral-300 rounded px-1 py-1 text-xs w-16 text-center"
                        />
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button onClick={() => handleUpdate(item.id)} className="text-black font-medium text-xs hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-neutral-500 font-medium text-xs hover:underline">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-4 font-medium">{item.name}</td>
                      <td className="p-4 text-neutral-600">{item.category}</td>
                      <td className="p-4 text-right font-semibold">{item.stock}</td>
                      <td className="p-4 text-right text-red-600">{item.totalUsed ?? 0}</td>
                      <td className="p-4 text-right font-semibold">{item.totalStock ?? item.stock + (item.totalUsed ?? 0)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            min="1"
                            placeholder="+Qty"
                            value={restockQuantities[item.id] ?? ""}
                            onChange={(e) => setRestockQuantities((current) => ({ ...current, [item.id]: e.target.value }))}
                            className="w-20 rounded border border-neutral-300 px-2 py-1 text-center text-xs"
                            aria-label={`Restock ${item.name}`}
                          />
                          <button onClick={() => handleRestock(item.id)} className="rounded bg-black px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800">Add</button>
                        </div>
                      </td>
                      <td className="p-4 text-right space-x-3">
                        <button onClick={() => startEdit(item)} className="text-black hover:underline text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs font-medium">Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
