/** CON must never contribute to the pre-existing HRGA / general numbering pools. */
export function sharesLetterSequence(candidateType: string, letterType: string): boolean {
  const con = "SURAT_PENGANTAR_KONSOLIDASIAN";
  if (candidateType === con || letterType === con) return candidateType === con && letterType === con;
  return letterType === "HRGA" ? candidateType === "HRGA" : candidateType !== "HRGA";
}
