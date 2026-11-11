export function notificationPath(item: { entityType?: string | null; entityId?: string | null; id: string }) {
  const paths: Record<string, string> = {
    LEAVE: "/leave-management", BUSINESS_TRIP: "/business-trip",
    REIMBURSEMENT: "/reimbursement", OVERTIME: "/overtime",
  };
  const path = paths[item.entityType ?? ""];
  if (!path) return "/dashboard";
  const query = new URLSearchParams();
  if (item.entityId) query.set("entityId", item.entityId);
  query.set("notif", item.id);
  return `${path}?${query}`;
}
