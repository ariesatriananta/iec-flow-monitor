export type OpeType = "BUSINESS_TRIP" | "MEALS";
export type OpeStatus = "DRAFT" | "ISSUED" | "PAID" | "VOID";

export type OpeClientSnapshot = {
  name: string;
  code: string;
  address: string | null;
  picName: string | null;
  npwp: string | null;
  npwp2: string | null;
};

export interface OpeItem {
  id: string;
  documentId: string;
  position: number;
  employeeId: string | null;
  employeeName: string | null;
  days: number | null;
  rate: number | null;
  expenseDate: Date | null;
  clientId: string | null;
  clientSnapshot: OpeClientSnapshot | null;
  description: string;
  amount: number;
}

export interface OpeDocument {
  id: string;
  type: OpeType;
  documentDate: Date;
  documentNumber: string;
  seqNo: number;
  numberYear: number;
  status: OpeStatus;
  clientId: string | null;
  clientSnapshot: OpeClientSnapshot | null;
  subject: string;
  notes: string | null;
  ppnRate: number;
  pph23Rate: number;
  subtotal: number;
  ppnAmount: number;
  pph23Amount: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  items?: OpeItem[];
}

type OpeHeaderInput = {
  documentDate: Date | string;
  subject: string;
  notes?: string | null;
  usePpn?: boolean;
  usePph23?: boolean;
};

export type OpeInput = OpeHeaderInput & (
  | {
      type: "BUSINESS_TRIP";
      clientId: string;
      items: { employeeId: string; days: number; rate: number; description?: string }[];
    }
  | {
      type: "MEALS";
      items: { expenseDate: Date | string; clientId: string; description: string; amount: number }[];
    }
);

export interface OpeClientOption extends OpeClientSnapshot {
  id: string;
  latestContractDate: Date;
}
