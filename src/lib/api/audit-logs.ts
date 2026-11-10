export type AuditLog = {
  id: string;
  module: string;
  entityId: string | null;
  action: string;
  actorUserId: string | null;
  actorName: string;
  details: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogResponse = {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

export async function fetchAuditLogs(params: {
  page?: number;
  limit?: number;
  module?: string;
  action?: string;
} = {}): Promise<AuditLogResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("limit", String(params.limit ?? 25));
  if (params.module) searchParams.set("module", params.module);
  if (params.action) searchParams.set("action", params.action);

  const response = await fetch(`/api/audit-logs?${searchParams.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Gagal memuat audit log");
  }
  return response.json();
}
