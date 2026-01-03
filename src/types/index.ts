// Client Types
export interface Client {
  id: string;
  name: string;
  code: string;
  address?: string;
  picName?: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Service Code for Proposals
export type ServiceCode = 'A' | 'B';

// Contract/Proposal Status
export type ContractStatus = 'ACTIVE' | 'VOID' | 'CANCELLED';

// Payment Status (computed)
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

// Contract/Proposal Types
export interface Contract {
  id: string;
  proposalDate: Date;
  clientId: string;
  client?: Client;
  serviceCode: ServiceCode;
  engagementNo: number;
  seqNo: number;
  proposalNumber: string;
  contractTitle?: string;
  contractValue: number;
  paymentStatus: PaymentStatus;
  status: ContractStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  termins?: Termin[];
}

// Termin Status
export type TerminStatus = 'PENDING' | 'INVOICED' | 'PAID' | 'VOID';

// Payment Termin Types
export interface Termin {
  id: string;
  contractId: string;
  contract?: Contract;
  terminName: string;
  terminAmount: number;
  dueDate?: Date;
  invoiceId?: string;
  invoice?: Invoice;
  paymentReceivedDate?: Date;
  status: TerminStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Invoice Status
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';

// Invoice Types
export interface Invoice {
  id: string;
  invoiceDate: Date;
  contractId: string;
  contract?: Contract;
  terminId: string;
  termin?: Termin;
  seqNo: number;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Letter Type
export type LetterType = 'HRGA' | 'UMUM' | 'SURAT_TUGAS';

export type HrgaCategory = 'EMPLOYEE' | 'INTERNSHIP';

// Letter Status
export type LetterStatus = 'ACTIVE' | 'VOID' | 'CANCELLED';

// Letter Types
export interface Letter {
  id: string;
  letterDate: Date;
  clientId?: string;
  client?: Client;
  letterType: LetterType;
  hrgaCategory?: HrgaCategory | null;
  subject: string;
  seqNo: number;
  letterNumber: string;
  status: LetterStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  assignment?: LetterAssignment;
}

export interface LetterAssignment {
  id: string;
  letterId: string;
  title: string;
  auditPeriodText: string;
  createdAt: Date;
  updatedAt: Date;
  members?: LetterAssignmentMember[];
}

export interface LetterAssignmentMember {
  id: string;
  assignmentId: string;
  name: string;
  role: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// User Types
export interface User {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN';
  createdAt: Date;
  updatedAt: Date;
}

// Dashboard KPI Types
export interface DashboardKPI {
  totalContracts: number;
  totalContractValue: number;
  totalPaymentReceived: number;
  pendingPayments: number;
}

export interface DashboardMonthlyDatum {
  month: string;
  contracts: number;
  payments: number;
}

// Activity Types for Dashboard
export interface RecentActivity {
  id: string;
  type: 'CONTRACT' | 'INVOICE' | 'LETTER';
  number: string;
  clientName: string;
  date: Date;
  status: string;
}
