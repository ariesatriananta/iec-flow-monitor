// Client Types
export interface Client {
  id: string;
  name: string;
  code: string;
  npwp?: string;
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

export type HrgaCategory = 'PERMANEN' | 'NON_PERMANEN' | 'INTERNSHIP';

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
  role: 'ADMIN' | 'STAFF';
  employeeId?: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    fullName?: string;
    nip?: string;
    gender?: "MALE" | "FEMALE" | string;
    title?: string;
    department?: string;
    workLocation?: string;
    phone?: string;
    email?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    isActive: boolean;
    updatedAt: Date;
  } | null;
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

export interface StaffDashboardSummary {
  todayAttendance: AttendanceRecord | null;
  counts: {
    leaveSubmitted: number;
    tripSubmitted: number;
    reimbursementSubmitted: number;
  };
  recents: {
    leaves: LeaveRequest[];
    trips: BusinessTrip[];
    reimbursements: Reimbursement[];
  };
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

export interface Employee {
  id: string;
  employeeCode: string;
  fullName?: string;
  nip?: string;
  gender?: "MALE" | "FEMALE" | string;
  title?: string;
  department?: string;
  workLocation?: string;
  phone?: string;
  email?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user?: Pick<User, "id" | "username" | "name" | "role">;
  canHardDelete?: boolean;
  hardDeleteReasons?: string[];
}

export type AttendanceStatus = "PRESENT" | "SICK" | "LEAVE" | "ABSENT";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceDate: Date;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  checkInLocation?: string | null;
  checkOutLocation?: string | null;
  status: AttendanceStatus | string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: Pick<
    Employee,
    "id" | "employeeCode" | "fullName" | "nip" | "title" | "department" | "email" | "workLocation"
  >;
  user?: Pick<User, "id" | "username" | "name" | "role">;
}

export type WorkflowStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "WAITING_LEVEL_2"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "PAID";

export interface WorkflowEvent {
  id: string;
  module: "LEAVE" | "BUSINESS_TRIP" | "REIMBURSEMENT" | string;
  entityId: string;
  level?: number | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  createdAt: Date;
  actorUser?: Pick<User, "id" | "username" | "name" | "role"> | null;
  actorEmployee?: Pick<Employee, "id" | "fullName" | "title" | "department"> | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  reason: string;
  startDate: Date;
  endDate: Date;
  status: WorkflowStatus | string;
  adminNote?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: Pick<Employee, "id" | "employeeCode" | "fullName" | "title" | "department">;
  user?: Pick<User, "id" | "username" | "name" | "role">;
  workflowEvents?: WorkflowEvent[];
}

export interface BusinessTrip {
  id: string;
  employeeId: string;
  destinationCity: string;
  companyName: string;
  purpose?: string | null;
  startDate: Date;
  endDate: Date;
  allowanceRuleId?: string | null;
  allowanceRuleLabel?: string | null;
  allowanceDaily?: number | null;
  allowanceDays?: number | null;
  allowanceTotal?: number | null;
  isOutOfTownOvernight?: boolean;
  transportOptionId?: string | null;
  compensationBreakdown?: {
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
      amount: number;
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
  } | null;
  compensationTotal?: number | null;
  status: WorkflowStatus | string;
  adminNote?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: Pick<
    Employee,
    "id" | "employeeCode" | "fullName" | "title" | "department" | "bankAccountName" | "bankAccountNumber"
  >;
  user?: Pick<User, "id" | "username" | "name" | "role">;
  workflowEvents?: WorkflowEvent[];
}

export interface Reimbursement {
  id: string;
  employeeId: string;
  category: string;
  amount: number;
  itemCount?: number;
  submissionDate: Date;
  description?: string | null;
  receiptUrl?: string | null;
  status: WorkflowStatus | string;
  adminNote?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  paidAt?: Date | null;
  paidProofUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: Pick<
    Employee,
    "id" | "employeeCode" | "fullName" | "title" | "department" | "bankAccountName" | "bankAccountNumber"
  >;
  user?: Pick<User, "id" | "username" | "name" | "role">;
  items?: ReimbursementItem[];
  attachments?: ReimbursementAttachment[];
  workflowEvents?: WorkflowEvent[];
}

export interface ReimbursementItem {
  id: string;
  reimbursementId: string;
  expenseDate: Date;
  category: string;
  clientName?: string | null;
  description?: string | null;
  amount: number;
  attachment?: ReimbursementAttachment | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReimbursementAttachment {
  id: string;
  reimbursementId: string;
  reimbursementItemId?: string | null;
  purpose: "RECEIPT" | "PAID_PROOF" | string;
  fileUrl: string;
  fileKey?: string | null;
  fileName: string;
  contentType?: string | null;
  fileSize?: number | null;
  uploadedBy: string;
  createdAt: Date;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: "LEAVE" | "BUSINESS_TRIP" | "REIMBURSEMENT" | string | null;
  entityId?: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date | null;
}
