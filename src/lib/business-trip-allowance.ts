export const BUSINESS_TRIP_TITLES = [
  "Intern",
  "Junior Staff",
  "Mid-level Staff",
  "Senior Staff",
  "Supervisor",
  "Asst. Manager",
  "Senior Manager",
  "Partner",
  "Director",
] as const;

export type OpeRule = {
  id: string;
  label: string;
  titles: string[];
  dailyAllowance: number;
};

export type TransportOption = {
  id: string;
  label: string;
  amount: number;
};

export type BusinessTripCompensationSettings = {
  opeRules: OpeRule[];
  mealPerDay: number;
  laundryPerWeek: number;
  laundryMinDays: number;
  transportOptions: TransportOption[];
};

export type BusinessTripCompensationBreakdown = {
  days: number;
  isOutOfTownOvernight: boolean;
  ope: {
    ruleId: string | null;
    ruleLabel: string | null;
    daily: number;
    days: number;
    total: number;
  };
  meal: {
    daily: number;
    days: number;
    total: number;
  };
  laundry: {
    weekly: number;
    weeks: number;
    minDays: number;
    total: number;
  };
  transport: {
    optionId: string | null;
    label: string | null;
    amount: number;
  };
  total: number;
};

export const DEFAULT_OPE_RULES: OpeRule[] = [
  {
    id: "director-partner",
    label: "Direktur s/d Partner",
    titles: ["Director", "Partner"],
    dailyAllowance: 300000,
  },
  {
    id: "asst-manager-senior-manager",
    label: "Asst. Manager s/d Senior Manager",
    titles: ["Asst. Manager", "Senior Manager"],
    dailyAllowance: 250000,
  },
  {
    id: "senior-supervisor",
    label: "Senior s/d Supervisor",
    titles: ["Senior Staff", "Supervisor"],
    dailyAllowance: 200000,
  },
  {
    id: "junior-mid",
    label: "Junior s/d Mid-level",
    titles: ["Junior Staff", "Mid-level Staff"],
    dailyAllowance: 150000,
  },
  {
    id: "intern",
    label: "Intern",
    titles: ["Intern"],
    dailyAllowance: 100000,
  },
];

export const DEFAULT_TRANSPORT_OPTIONS: TransportOption[] = [
  {
    id: "soetta",
    label: "Transport bandara PP (Soetta)",
    amount: 500000,
  },
  {
    id: "halim",
    label: "Transport bandara PP (Halim)",
    amount: 300000,
  },
  {
    id: "gambir-senen",
    label: "Transport stasiun PP (Gambir/Senen)",
    amount: 300000,
  },
];

export const DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS: BusinessTripCompensationSettings = {
  opeRules: DEFAULT_OPE_RULES,
  mealPerDay: 50000,
  laundryPerWeek: 30000,
  laundryMinDays: 7,
  transportOptions: DEFAULT_TRANSPORT_OPTIONS,
};

export function normalizeOpeRules(rules: OpeRule[]) {
  return rules
    .map((rule) => ({
      ...rule,
      id: rule.id.trim(),
      label: rule.label.trim(),
      titles: rule.titles.map((title) => title.trim()).filter(Boolean),
      dailyAllowance: Number(rule.dailyAllowance),
    }))
    .filter(
      (rule) =>
        rule.id.length > 0 &&
        rule.label.length > 0 &&
        Number.isFinite(rule.dailyAllowance) &&
        rule.dailyAllowance >= 0 &&
        rule.titles.length > 0
    );
}

export function normalizeTransportOptions(options: TransportOption[]) {
  return options
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      label: item.label.trim(),
      amount: Number(item.amount),
    }))
    .filter(
      (item) =>
        item.id.length > 0 &&
        item.label.length > 0 &&
        Number.isFinite(item.amount) &&
        item.amount >= 0
    );
}

export function resolveOpeRuleByTitle(
  employeeTitle: string | null | undefined,
  rules: OpeRule[]
) {
  const normalizedTitle = (employeeTitle ?? "").trim().toLowerCase();
  if (!normalizedTitle) return null;

  return (
    rules.find((rule) =>
      rule.titles.some((title) => title.trim().toLowerCase() === normalizedTitle)
    ) ?? null
  );
}

export function calculateInclusiveDays(startDate: Date, endDate: Date) {
  const start = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const diff = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diff);
}

export function calculateBusinessTripCompensation(params: {
  employeeTitle: string | null | undefined;
  startDate: Date;
  endDate: Date;
  isOutOfTownOvernight: boolean;
  transportOptionId: string | null;
  settings: BusinessTripCompensationSettings;
}): BusinessTripCompensationBreakdown {
  const days = calculateInclusiveDays(params.startDate, params.endDate);
  const opeRule = resolveOpeRuleByTitle(params.employeeTitle, params.settings.opeRules);
  const transportOption =
    params.settings.transportOptions.find(
      (item) => item.id === (params.transportOptionId ?? "")
    ) ?? null;

  const opeDaily = params.isOutOfTownOvernight ? opeRule?.dailyAllowance ?? 0 : 0;
  const opeTotal = opeDaily * days;
  const mealDaily = params.settings.mealPerDay;
  const mealTotal = mealDaily * days;
  const laundryWeeks =
    days > params.settings.laundryMinDays ? Math.ceil(days / 7) : 0;
  const laundryWeekly = params.settings.laundryPerWeek;
  const laundryTotal = laundryWeeks * laundryWeekly;
  const transportAmount = transportOption?.amount ?? 0;
  const total = opeTotal + mealTotal + laundryTotal + transportAmount;

  return {
    days,
    isOutOfTownOvernight: params.isOutOfTownOvernight,
    ope: {
      ruleId: params.isOutOfTownOvernight ? opeRule?.id ?? null : null,
      ruleLabel: params.isOutOfTownOvernight ? opeRule?.label ?? null : null,
      daily: opeDaily,
      days,
      total: opeTotal,
    },
    meal: {
      daily: mealDaily,
      days,
      total: mealTotal,
    },
    laundry: {
      weekly: laundryWeekly,
      weeks: laundryWeeks,
      minDays: params.settings.laundryMinDays,
      total: laundryTotal,
    },
    transport: {
      optionId: transportOption?.id ?? null,
      label: transportOption?.label ?? null,
      amount: transportAmount,
    },
    total,
  };
}
