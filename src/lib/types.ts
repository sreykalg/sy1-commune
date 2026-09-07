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
  image: string;
  available: boolean;
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
  subtotal?: number;
  discount?: number;
  promoLabel?: string;
  voided?: boolean;
};

export type PosState = {
  isOpen: boolean;
  openedAt: string | null;
  openedBy: string | null;
};

export type Promotion = {
  id: string;
  label: string;
  type: "percent" | "amount";
  value: number;
  active: boolean;
};

export type StaffUser = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  title: string;
};

export type StoreData = {
  pos: PosState;
  orders: Order[];
  menu: MenuItem[];
  categories: string[];
  promotions: Promotion[];
  users: StaffUser[];
};
