export type Role = "admin" | "manager" | "cashier" | "barista";

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

export type PaymentMethod = "cash" | "gcash" | "maya";

export type Order = {
  id: string;
  createdAt: string;
  baristaName: string;
  items: OrderItem[];
  total: number;
  subtotal?: number;
  discount?: number;
  promoLabel?: string;
  paymentMethod?: PaymentMethod;
  ticketNo?: string;
  paid?: number;
  change?: number;
  voided?: boolean;
  voidReason?: string;
  recordType?: "Sale" | "Purchase";
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

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
  stock: number;
  maxStock: number;
};

export type RecipeIngredient = {
  inventoryItemId: string;
  name: string;
  amount: number;
  unit: string;
};

export type UsageLog = {
  id: string;
  orderId: string;
  orderItemId: string;
  date: string;
  itemName: string;
  usedAmount: number;
  unit: string;
  remaining?: number;
};

export type RestockRecord = {
  id: string;
  itemName: string;
  quantityAdded: number;
  date: string;
};

export type CostingIngredient = {
  name: string;
  amount: number;
  unit: string;
  outputCups?: number;
};

export type CostingItem = {
  id: string;
  productName: string;
  ingredients: CostingIngredient[];
};

export type LoginActivity = {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: Role;
  type: "login" | "logout";
  at: string;
};

export type OffRequest = {
  id: string;
  userId: string;
  name: string;
  date: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
};

export type VoidRequest = {
  id: string;
  kind: "order" | "checkout";
  orderId?: string;
  ticketNo?: string;
  cashierId: string;
  cashierName: string;
  reason: string;
  items: OrderItem[];
  total: number;
  promoId?: string | null;
  paymentMethod?: PaymentMethod;
  status: "pending" | "approved" | "denied";
  createdAt: string;
};

export type StoreData = {
  pos: PosState;
  orders: Order[];
  menu: MenuItem[];
  categories: string[];
  promotions: Promotion[];
  users: StaffUser[];
  inventory: InventoryItem[];
  recipes: Record<string, RecipeIngredient[]>;
  usageLogs: UsageLog[];
  restocks: RestockRecord[];
  costings: CostingItem[];
  loginActivity: LoginActivity[];
  offRequests: OffRequest[];
  voidRequests: VoidRequest[];
  loginGates: {
    admin: string;
    cashier: string;
  };
};
