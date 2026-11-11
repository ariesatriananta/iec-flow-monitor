// Crop coordinates belong to the existing 1819 x 2573 transparent A4 asset.
// Keep crop and image in the same coordinate system: printer scaling must not
// change the amount of letterhead visible as a fixed-pixel container would.
export const LETTERHEAD_WIDTH = 1819;
export const LETTERHEAD_HEIGHT = 540;
export const LETTERHEAD_IMAGE_HEIGHT = 2573;
export const LETTERHEAD_VIEWBOX = `0 0 ${LETTERHEAD_WIDTH} ${LETTERHEAD_HEIGHT}`;
export const LETTERHEAD_CSS = ".print-letterhead { display: block; width: 100%; height: auto; overflow: hidden; }";

export function renderPrintLetterhead(headerUrl: string): string {
  const url = headerUrl.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]!));
  return `<svg class="print-letterhead" xmlns="http://www.w3.org/2000/svg" width="${LETTERHEAD_WIDTH}" height="${LETTERHEAD_HEIGHT}" viewBox="${LETTERHEAD_VIEWBOX}" role="img" aria-label="Kop KAP Krisnawan, Nugroho &amp; Fahmy"><image href="${url}" width="${LETTERHEAD_WIDTH}" height="${LETTERHEAD_IMAGE_HEIGHT}" /></svg>`;
}
