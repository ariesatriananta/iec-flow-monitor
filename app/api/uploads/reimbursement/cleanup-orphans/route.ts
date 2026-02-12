export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { reimbursementAttachments } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import {
  deleteObjectFromR2,
  listObjectsFromR2,
  tryResolveObjectKeyFromUrl,
} from "@/lib/storage/r2";

const toSafeNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun ?? true);
  const olderThanMinutes = toSafeNumber(body?.olderThanMinutes, 60, 0, 60 * 24 * 30);
  const maxDelete = toSafeNumber(body?.maxDelete, 200, 1, 2000);
  const maxScanObjects = toSafeNumber(body?.maxScanObjects, 10000, 100, 200000);

  const prefixBase = (process.env.R2_KEY_PREFIX ?? "uploads").replace(/^\/+|\/+$/g, "");
  const prefix = `${prefixBase}/reimbursement/`;
  const cutoff = Date.now() - olderThanMinutes * 60 * 1000;

  const db = getDb();
  const attachmentRows = await db
    .select({
      fileKey: reimbursementAttachments.fileKey,
      fileUrl: reimbursementAttachments.fileUrl,
    })
    .from(reimbursementAttachments);

  const referencedKeys = new Set<string>();
  for (const row of attachmentRows) {
    if (row.fileKey) {
      referencedKeys.add(row.fileKey);
      continue;
    }
    const fallbackKey = tryResolveObjectKeyFromUrl(row.fileUrl);
    if (fallbackKey) {
      referencedKeys.add(fallbackKey);
    }
  }

  let continuationToken: string | undefined;
  let scannedObjects = 0;
  const orphanCandidates: Array<{ key: string; lastModified: string | null }> = [];

  while (scannedObjects < maxScanObjects) {
    const listed = await listObjectsFromR2({
      prefix,
      continuationToken,
      maxKeys: 1000,
    });
    scannedObjects += listed.objects.length;

    for (const object of listed.objects) {
      if (referencedKeys.has(object.key)) continue;
      const objectTime = object.lastModified?.getTime();
      if (objectTime !== undefined && objectTime !== null && objectTime > cutoff) {
        continue;
      }
      orphanCandidates.push({
        key: object.key,
        lastModified: object.lastModified?.toISOString() ?? null,
      });
      if (orphanCandidates.length >= maxDelete) {
        break;
      }
    }

    if (orphanCandidates.length >= maxDelete) break;
    if (!listed.nextContinuationToken) break;
    continuationToken = listed.nextContinuationToken;
  }

  const deletedKeys: string[] = [];
  const failedDeletes: Array<{ key: string; error: string }> = [];

  if (!dryRun) {
    for (const item of orphanCandidates) {
      try {
        await deleteObjectFromR2(item.key);
        deletedKeys.push(item.key);
      } catch (error) {
        failedDeletes.push({
          key: item.key,
          error: error instanceof Error ? error.message : "Gagal menghapus file",
        });
      }
    }
  }

  return NextResponse.json({
    mode: dryRun ? "dry-run" : "delete",
    prefix,
    olderThanMinutes,
    scannedObjects,
    referencedKeyCount: referencedKeys.size,
    orphanCandidateCount: orphanCandidates.length,
    deletedCount: deletedKeys.length,
    failedCount: failedDeletes.length,
    orphanCandidates,
    deletedKeys,
    failedDeletes,
  });
}

