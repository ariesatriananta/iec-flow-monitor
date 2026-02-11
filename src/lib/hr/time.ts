const JAKARTA_TZ = "Asia/Jakarta";

type JakartaParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const getJakartaParts = (value = new Date()): JakartaParts => {
  const parts = formatter.formatToParts(value);
  const getNum = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: getNum("year"),
    month: getNum("month"),
    day: getNum("day"),
    hour: getNum("hour"),
    minute: getNum("minute"),
    second: getNum("second"),
  };
};

export const getJakartaDayStart = (value = new Date()) => {
  const { year, month, day } = getJakartaParts(value);
  const monthPad = String(month).padStart(2, "0");
  const dayPad = String(day).padStart(2, "0");
  return new Date(`${year}-${monthPad}-${dayPad}T00:00:00+07:00`);
};

