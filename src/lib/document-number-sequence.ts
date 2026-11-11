export function nextDocumentSequence(lastReserved: number, maxExisting: string): number {
  const previous = BigInt(lastReserved);
  const existing = BigInt(maxExisting);
  const next = (previous > existing ? previous : existing) + BigInt(1);
  if (next < BigInt(1) || next > BigInt(2_147_483_647)) {
    throw new Error("Urutan nomor dokumen sudah mencapai batas");
  }
  return Number(next);
}
