export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { settingsApprovalFlow } from "@/lib/db/schema";
import { uploadBufferToR2 } from "@/lib/storage/r2";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const normalizeFilename = (filename: string): string => {
  const cleaned = filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  return cleaned || "attachment";
};

const buildObjectKey = (
  ownerKey: string,
  purpose: "receipt" | "paid-proof",
  fileName: string
): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = now.getUTCDate().toString().padStart(2, "0");
  const prefix = (process.env.R2_KEY_PREFIX ?? "uploads").replace(/^\/+|\/+$/g, "");
  const random = crypto.randomUUID();
  return `${prefix}/reimbursement/${purpose}/${ownerKey}/${yyyy}/${mm}/${dd}/${random}-${fileName}`;
};

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const form = await request.formData();
  const fileValue = form.get("file");
  const purposeValue = form.get("purpose");
  const purpose = purposeValue === "paid-proof" ? "paid-proof" : "receipt";

  if (purpose === "paid-proof") {
    const isAdmin = auth.user.role === "ADMIN";
    let isAllowedApprover = false;
    if (auth.user.employeeId) {
      const db = getDb();
      const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
      const levels = approvalFlow?.reimbursementApprovalLevels ?? 2;
      isAllowedApprover =
        auth.user.employeeId === (approvalFlow?.reimbursementApproverLevel1EmployeeId ?? null) ||
        (levels === 2 &&
          auth.user.employeeId ===
            (approvalFlow?.reimbursementApproverLevel2EmployeeId ?? null));
    }
    if (!isAdmin && !isAllowedApprover) {
      return NextResponse.json(
        { error: "Hanya approver reimbursement yang boleh upload bukti transfer" },
        { status: 403 }
      );
    }
  }

  if (purpose === "receipt" && !auth.user.employeeId) {
    return NextResponse.json(
      { error: "Akun belum terhubung ke employee" },
      { status: 403 }
    );
  }

  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "File wajib diisi" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(fileValue.type)) {
    return NextResponse.json(
      { error: "Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF." },
      { status: 400 }
    );
  }

  if (fileValue.size <= 0 || fileValue.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file maksimal 2 MB." },
      { status: 400 }
    );
  }

  const fileName = normalizeFilename(fileValue.name);
  const ownerKey =
    purpose === "receipt"
      ? auth.user.employeeId!
      : auth.user.employeeId ?? auth.user.id;
  const objectKey = buildObjectKey(ownerKey, purpose, fileName);
  const buffer = Buffer.from(await fileValue.arrayBuffer());

  try {
    const uploaded = await uploadBufferToR2({
      key: objectKey,
      body: buffer,
      contentType: fileValue.type || "application/octet-stream",
    });

    return NextResponse.json(
      {
        fileName,
        size: fileValue.size,
        contentType: fileValue.type,
        key: uploaded.key,
        url: uploaded.url,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload file gagal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
