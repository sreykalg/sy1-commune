export type LoginGates = {
  admin: string;
  cashier: string;
};

export const DEFAULT_LOGIN_GATES: LoginGates = {
  admin: "mouna1233",
  cashier: "sale1803",
};

const RESERVED = new Set(["admin", "pos", "login", "drinks", "images", "api"]);

export function sanitizeLoginGate(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const next = value.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!next) return { ok: false, error: "Enter a login path." };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) {
    return { ok: false, error: "Use letters, numbers, and hyphens only." };
  }
  if (next.length < 4 || next.length > 32) {
    return { ok: false, error: "Keep the path between 4 and 32 characters." };
  }
  if (RESERVED.has(next)) {
    return { ok: false, error: "That path is reserved." };
  }
  return { ok: true, value: next };
}

export function normalizeLoginGates(gates?: Partial<LoginGates> | null): LoginGates {
  const adminResult = sanitizeLoginGate(gates?.admin ?? "");
  const cashierResult = sanitizeLoginGate(gates?.cashier ?? "");
  const admin = adminResult.ok ? adminResult.value : DEFAULT_LOGIN_GATES.admin;
  let cashier = cashierResult.ok ? cashierResult.value : DEFAULT_LOGIN_GATES.cashier;
  if (cashier === admin) {
    cashier = admin === DEFAULT_LOGIN_GATES.cashier ? `${DEFAULT_LOGIN_GATES.admin}-pos` : DEFAULT_LOGIN_GATES.cashier;
  }
  return { admin, cashier };
}

export function roleForLoginGate(gate: string, gates: LoginGates): "admin" | "cashier" | null {
  const value = gate.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!value) return null;
  if (value === gates.admin) return "admin";
  if (value === gates.cashier) return "cashier";
  return null;
}

export function loginPathForRole(role: "admin" | "cashier", gates: LoginGates) {
  return role === "admin" ? `/${gates.admin}` : `/${gates.cashier}`;
}
