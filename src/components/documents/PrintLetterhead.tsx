import { LETTERHEAD_HEIGHT, LETTERHEAD_IMAGE_HEIGHT, LETTERHEAD_VIEWBOX, LETTERHEAD_WIDTH } from "@/lib/print-letterhead";

export function PrintLetterhead({ src }: { src: string }) {
  return (
    <svg className="block h-auto w-full overflow-hidden" xmlns="http://www.w3.org/2000/svg"
      width={LETTERHEAD_WIDTH} height={LETTERHEAD_HEIGHT} viewBox={LETTERHEAD_VIEWBOX}
      role="img" aria-label="Kop KAP Krisnawan, Nugroho & Fahmy">
      <image href={src} width={LETTERHEAD_WIDTH} height={LETTERHEAD_IMAGE_HEIGHT} />
    </svg>
  );
}
