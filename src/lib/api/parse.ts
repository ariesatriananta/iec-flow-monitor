"use client";

import type {
  Client,
  Contract,
  Termin,
  Invoice,
  Letter,
  LetterAssignment,
  LetterAssignmentMember,
  Employee,
  AttendanceRecord,
  LeaveRequest,
  BusinessTrip,
  Reimbursement,
  ReimbursementItem,
  ReimbursementAttachment,
  WorkflowEvent,
  InAppNotification,
} from "@/types";

const toDate = (value: string | Date): Date => {
  return value instanceof Date ? value : new Date(value);
};

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
};

export const parseClient = (data: Client): Client => ({
  ...data,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseTermin = (data: Termin): Termin => ({
  ...data,
  terminAmount: toNumber(data.terminAmount),
  invoiceItems: Array.isArray(data.invoiceItems)
    ? data.invoiceItems.map((item) => ({
        description: String(item.description ?? ""),
        amount: toNumber(item.amount),
      }))
    : null,
  dueDate: data.dueDate ? toDate(data.dueDate) : undefined,
  paymentReceivedDate: data.paymentReceivedDate
    ? toDate(data.paymentReceivedDate)
    : undefined,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseInvoice = (data: Invoice): Invoice => ({
  ...data,
  amount: toNumber(data.amount),
  pph23Rate: data.pph23Rate === null || data.pph23Rate === undefined
    ? null
    : toNumber(data.pph23Rate),
  invoiceDate: toDate(data.invoiceDate),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseLetter = (data: Letter): Letter => ({
  ...data,
  letterDate: toDate(data.letterDate),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  client: data.client ? parseClient(data.client) : undefined,
  assignment: data.assignment ? parseLetterAssignment(data.assignment) : undefined,
});

const parseLetterAssignmentMember = (
  data: LetterAssignmentMember
): LetterAssignmentMember => ({
  ...data,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

const parseLetterAssignment = (data: LetterAssignment): LetterAssignment => ({
  ...data,
  executionStartDate: data.executionStartDate ? toDate(data.executionStartDate) : null,
  executionEndDate: data.executionEndDate ? toDate(data.executionEndDate) : null,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  members: data.members ? data.members.map(parseLetterAssignmentMember) : undefined,
});

export const parseContract = (data: Contract): Contract => ({
  ...data,
  proposalDate: toDate(data.proposalDate),
  contractValue: toNumber(data.contractValue),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  client: data.client ? parseClient(data.client) : undefined,
  termins: data.termins ? data.termins.map(parseTermin) : undefined,
});

export const parseEmployee = (data: Employee): Employee => ({
  ...data,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseAttendanceRecord = (data: AttendanceRecord): AttendanceRecord => ({
  ...data,
  attendanceDate: toDate(data.attendanceDate),
  checkInAt: data.checkInAt ? toDate(data.checkInAt) : null,
  checkOutAt: data.checkOutAt ? toDate(data.checkOutAt) : null,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseLeaveRequest = (data: LeaveRequest): LeaveRequest => ({
  ...data,
  startDate: toDate(data.startDate),
  endDate: toDate(data.endDate),
  approvedAt: data.approvedAt ? toDate(data.approvedAt) : null,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  workflowEvents: data.workflowEvents?.map(parseWorkflowEvent),
});

export const parseBusinessTrip = (data: BusinessTrip): BusinessTrip => ({
  ...data,
  startDate: toDate(data.startDate),
  endDate: toDate(data.endDate),
  allowanceDaily:
    data.allowanceDaily === null || data.allowanceDaily === undefined
      ? null
      : toNumber(data.allowanceDaily),
  allowanceDays:
    data.allowanceDays === null || data.allowanceDays === undefined
      ? null
      : toNumber(data.allowanceDays),
  allowanceTotal:
    data.allowanceTotal === null || data.allowanceTotal === undefined
      ? null
      : toNumber(data.allowanceTotal),
  compensationTotal:
    data.compensationTotal === null || data.compensationTotal === undefined
      ? null
      : toNumber(data.compensationTotal),
  approvedAt: data.approvedAt ? toDate(data.approvedAt) : null,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  workflowEvents: data.workflowEvents?.map(parseWorkflowEvent),
});

export const parseReimbursement = (data: Reimbursement): Reimbursement => ({
  ...data,
  amount: toNumber(data.amount),
  itemCount: data.itemCount ?? (data.items?.length ?? 0),
  submissionDate: toDate(data.submissionDate),
  approvedAt: data.approvedAt ? toDate(data.approvedAt) : null,
  paidAt: data.paidAt ? toDate(data.paidAt) : null,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  items: data.items ? data.items.map(parseReimbursementItem) : undefined,
  attachments: data.attachments
    ? data.attachments.map(parseReimbursementAttachment)
    : undefined,
  workflowEvents: data.workflowEvents?.map(parseWorkflowEvent),
});

const parseReimbursementItem = (data: ReimbursementItem): ReimbursementItem => ({
  ...data,
  expenseDate: toDate(data.expenseDate),
  amount: toNumber(data.amount),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

const parseReimbursementAttachment = (
  data: ReimbursementAttachment
): ReimbursementAttachment => ({
  ...data,
  fileSize: data.fileSize ?? null,
  createdAt: toDate(data.createdAt),
});

const parseWorkflowEvent = (data: WorkflowEvent): WorkflowEvent => ({
  ...data,
  createdAt: toDate(data.createdAt),
});

export const parseInAppNotification = (data: InAppNotification): InAppNotification => ({
  ...data,
  createdAt: toDate(data.createdAt),
  readAt: data.readAt ? toDate(data.readAt) : null,
});
