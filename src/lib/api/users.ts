import type { User } from "@/types";

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch("/api/users", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }
  return response.json();
}

export async function createUser(payload: {
  username: string;
  name: string;
  password: string;
}): Promise<User> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to create user");
  }
  return response.json();
}

export async function updateUser(
  id: string,
  payload: { username?: string; name?: string; password?: string }
): Promise<User> {
  const response = await fetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to update user");
  }
  return response.json();
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`/api/users/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to delete user");
  }
}
