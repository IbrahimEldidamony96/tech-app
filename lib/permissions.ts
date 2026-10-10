export type StaffRole =
  | "SUPPORT"
  | "PRODUCT_MANAGER"
  | "ORDER_MANAGER"
  | "ADMIN"
  | "SUPER_ADMIN";

export type Permission =
  | "catalog:read"
  | "catalog:write"
  | "inventory:read"
  | "inventory:write"
  | "orders:read"
  | "orders:write"
  | "returns:read"
  | "returns:write"
  | "marketing:read"
  | "marketing:write"
  | "staff:manage"
  | "audit:read"
  | "analytics:read"
  | "settings:manage";

const ALL: Permission[] = [
  "catalog:read","catalog:write","inventory:read","inventory:write",
  "orders:read","orders:write","returns:read","returns:write",
  "marketing:read","marketing:write","staff:manage","audit:read",
  "analytics:read","settings:manage",
];

const MATRIX: Record<StaffRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL,
  PRODUCT_MANAGER: ["catalog:read","catalog:write","inventory:read","inventory:write","marketing:read","marketing:write","analytics:read"],
  ORDER_MANAGER: ["orders:read","orders:write","returns:read","returns:write","inventory:read","analytics:read"],
  SUPPORT: ["orders:read","returns:read"],
};

export function isStaffRole(role: string | undefined | null): role is StaffRole {
  return !!role && role !== "CUSTOMER" && role in MATRIX;
}

export function hasPermission(role: string | undefined | null, permission: Permission) {
  return isStaffRole(role) && MATRIX[role].includes(permission);
}
