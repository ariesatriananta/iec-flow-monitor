const SMALL = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function toWords(n: number): string {
  if (n < 12) return SMALL[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rest = n % 10;
    return `${toWords(tens)} puluh${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 200) return `seratus${n > 100 ? ` ${toWords(n - 100)}` : ""}`;
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${toWords(hundreds)} ratus${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 2000) return `seribu${n > 1000 ? ` ${toWords(n - 1000)}` : ""}`;
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    return `${toWords(thousands)} ribu${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 1000000000) {
    const millions = Math.floor(n / 1000000);
    const rest = n % 1000000;
    return `${toWords(millions)} juta${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 1000000000000) {
    const billions = Math.floor(n / 1000000000);
    const rest = n % 1000000000;
    return `${toWords(billions)} miliar${rest ? ` ${toWords(rest)}` : ""}`;
  }
  const trillions = Math.floor(n / 1000000000000);
  const rest = n % 1000000000000;
  return `${toWords(trillions)} triliun${rest ? ` ${toWords(rest)}` : ""}`;
}

export function terbilang(value: number): string {
  if (!Number.isFinite(value)) return "";
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "nol";
  return toWords(n).trim();
}
