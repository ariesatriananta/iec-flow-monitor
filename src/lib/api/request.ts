export async function requestJson<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: string; message?: string };
        const message = parsed.error || parsed.message;
        throw new Error(message || raw);
      } catch {
        throw new Error(raw);
      }
    }
    throw new Error("Request failed");
  }

  return response.json() as Promise<T>;
}
