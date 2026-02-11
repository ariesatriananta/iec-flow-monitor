import type { User } from "@/types";

export type UserRole = User["role"];

const STAFF_ALLOWED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/employees",
  "/attendance",
  "/leave-management",
  "/business-trip",
  "/reimbursement",
];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/clients",
  "/contracts",
  "/invoices",
  "/letters",
  "/users",
  "/settings",
  "/profile",
  "/employees",
  "/attendance",
  "/leave-management",
  "/business-trip",
  "/reimbursement",
];

export const isProtectedPath = (pathname: string) => {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};

export const canAccessPath = (role: UserRole, pathname: string) => {
  if (role === "ADMIN") return true;
  return STAFF_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};

