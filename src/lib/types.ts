export type Role = "admin" | "barista";

export type Session = {
  userId: string;
  username: string;
  name: string;
  role: Role;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
};

export type OrderItem = {
  productId: string;
  name: string;
  qty: number;
  price: number;
};

export type Order = {
  id: string;
  createdAt: string;
  baristaName: string;
  items: OrderItem[];
  total: number;
};

export type PosState = {
  isOpen: boolean;
  openedAt: string | null;
  openedBy: string | null;
};

export type StoreData = {
  pos: PosState;
  orders: Order[];
};
