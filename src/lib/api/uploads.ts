export interface UploadReimbursementResponse {
  fileName: string;
  size: number;
  contentType: string;
  key: string;
  url: string;
}

export async function uploadReimbursementFile(
  file: File,
  purpose: "receipt" | "paid-proof" = "receipt"
): Promise<UploadReimbursementResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  const response = await fetch("/api/uploads/reimbursement", {
    method: "POST",
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as
    | UploadReimbursementResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(data && "error" in data ? data.error || "Upload gagal" : "Upload gagal");
  }

  if (!data || !("url" in data)) {
    throw new Error("Response upload tidak valid");
  }

  return data;
}

