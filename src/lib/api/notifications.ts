import type { InAppNotification } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseInAppNotification } from "@/lib/api/parse";

type FetchNotificationsResult = {
  items: InAppNotification[];
  unreadCount: number;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export async function fetchNotifications(limit = 20, offset = 0) {
  const data = await requestJson<FetchNotificationsResult>(
    `/api/notifications?limit=${limit}&offset=${offset}`,
    { cache: "no-store" }
  );

  return {
    ...data,
    items: data.items.map(parseInAppNotification),
  };
}

export async function markNotificationRead(id: string) {
  const data = await requestJson<InAppNotification>(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });
  return parseInAppNotification(data);
}

export async function markAllNotificationsRead() {
  await requestJson<{ ok: boolean }>("/api/notifications", {
    method: "PATCH",
  });
}
