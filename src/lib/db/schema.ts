import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

export const clients = pgTable(
  "clients",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    npwp: text("npwp"),
    address: text("address"),
    picName: text("pic_name"),
    email: text("email"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    codeUnique: uniqueIndex("clients_code_unique").on(table.code),
  })
);

export const contracts = pgTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    proposalDate: timestamp("proposal_date", { mode: "date" }).notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    serviceCode: text("service_code").notNull(),
    engagementNo: integer("engagement_no").notNull(),
    seqNo: integer("seq_no").notNull(),
    proposalNumber: text("proposal_number").notNull(),
    contractTitle: text("contract_title"),
    contractValue: numeric("contract_value", { precision: 15, scale: 0 }).notNull(),
    paymentStatus: text("payment_status").notNull(),
    status: text("status").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    proposalNumberUnique: uniqueIndex("contracts_proposal_number_unique").on(
      table.proposalNumber
    ),
    clientIdIdx: index("contracts_client_id_idx").on(table.clientId),
  })
);

export const termins = pgTable(
  "termins",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id),
    terminName: text("termin_name").notNull(),
    terminAmount: numeric("termin_amount", { precision: 15, scale: 0 }).notNull(),
    dueDate: timestamp("due_date", { mode: "date" }),
    invoiceId: text("invoice_id"),
    paymentReceivedDate: timestamp("payment_received_date", { mode: "date" }),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    contractIdIdx: index("termins_contract_id_idx").on(table.contractId),
  })
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    invoiceDate: timestamp("invoice_date", { mode: "date" }).notNull(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id),
    terminId: text("termin_id")
      .notNull()
      .references(() => termins.id),
    seqNo: integer("seq_no").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    amount: numeric("amount", { precision: 15, scale: 0 }).notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    invoiceNumberUnique: uniqueIndex("invoices_invoice_number_unique").on(
      table.invoiceNumber
    ),
    contractIdIdx: index("invoices_contract_id_idx").on(table.contractId),
    terminIdIdx: index("invoices_termin_id_idx").on(table.terminId),
  })
);

export const letters = pgTable(
  "letters",
  {
    id: text("id").primaryKey(),
    letterDate: timestamp("letter_date", { mode: "date" }).notNull(),
    clientId: text("client_id").references(() => clients.id),
    letterType: text("letter_type").notNull(),
    hrgaCategory: text("hrga_category"),
    subject: text("subject").notNull(),
    seqNo: integer("seq_no").notNull(),
    letterNumber: text("letter_number").notNull(),
    status: text("status").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    letterNumberUnique: uniqueIndex("letters_letter_number_unique").on(
      table.letterNumber
    ),
    clientIdIdx: index("letters_client_id_idx").on(table.clientId),
  })
);

export const letterAssignments = pgTable(
  "letter_assignments",
  {
    id: text("id").primaryKey(),
    letterId: text("letter_id")
      .notNull()
      .references(() => letters.id),
    title: text("title").notNull(),
    auditPeriodText: text("audit_period_text").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    letterIdUnique: uniqueIndex("letter_assignments_letter_id_unique").on(
      table.letterId
    ),
  })
);

export const letterAssignmentMembers = pgTable(
  "letter_assignment_members",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => letterAssignments.id),
    name: text("name").notNull(),
    role: text("role").notNull(),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    assignmentIdIdx: index("letter_assignment_members_assignment_id_idx").on(
      table.assignmentId
    ),
  })
);

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "STAFF"]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("ADMIN"),
    employeeId: text("employee_id").references(() => employees.id),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    usernameUnique: uniqueIndex("users_username_unique").on(table.username),
    employeeIdUnique: uniqueIndex("users_employee_id_unique").on(table.employeeId),
  })
);

export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyAddress: text("company_address"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  companyLogoUrl: text("company_logo_url"),
  numberingPrefix: text("numbering_prefix").notNull(),
  numberingReset: text("numbering_reset").notNull(),
  defaultPpnRate: numeric("default_ppn_rate", { precision: 5, scale: 2 }).notNull(),
  defaultSignerName: text("default_signer_name").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

export const settingsApprovalFlow = pgTable("settings_approval_flow", {
  id: text("id").primaryKey(),
  leaveApprovalLevels: integer("leave_approval_levels").notNull().default(2),
  leaveApproverLevel1Role: text("leave_approver_level1_role").notNull(),
  leaveApproverLevel2Role: text("leave_approver_level2_role").notNull(),
  leaveApproverLevel1EmployeeId: text("leave_approver_level1_employee_id").references(
    () => employees.id
  ),
  leaveApproverLevel2EmployeeId: text("leave_approver_level2_employee_id").references(
    () => employees.id
  ),
  reimbursementApprovalLevels: integer("reimbursement_approval_levels").notNull().default(2),
  reimbursementApproverLevel1Role: text("reimbursement_approver_level1_role").notNull(),
  reimbursementApproverLevel2Role: text("reimbursement_approver_level2_role").notNull(),
  reimbursementApproverLevel1EmployeeId: text("reimbursement_approver_level1_employee_id").references(
    () => employees.id
  ),
  reimbursementApproverLevel2EmployeeId: text("reimbursement_approver_level2_employee_id").references(
    () => employees.id
  ),
  businessTripApprovalLevels: integer("business_trip_approval_levels").notNull().default(2),
  businessTripApproverLevel1Role: text("business_trip_approver_level1_role").notNull(),
  businessTripApproverLevel2Role: text("business_trip_approver_level2_role").notNull(),
  businessTripApproverLevel1EmployeeId: text("business_trip_approver_level1_employee_id").references(
    () => employees.id
  ),
  businessTripApproverLevel2EmployeeId: text("business_trip_approver_level2_employee_id").references(
    () => employees.id
  ),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

export const settingsWorkSchedule = pgTable("settings_work_schedule", {
  id: text("id").primaryKey(),
  timezone: text("timezone").notNull(),
  checkInDeadline: text("check_in_deadline").notNull(),
  workStart: text("work_start").notNull(),
  workEnd: text("work_end").notNull(),
  allowFlexibleCheckout: boolean("allow_flexible_checkout").notNull().default(true),
  workingDaysJson: text("working_days_json").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

export const settingsReimbursementLimit = pgTable("settings_reimbursement_limit", {
  id: text("id").primaryKey(),
  transportLimit: numeric("transport_limit", { precision: 15, scale: 0 }).notNull(),
  mealLimit: numeric("meal_limit", { precision: 15, scale: 0 }).notNull(),
  otherLimit: numeric("other_limit", { precision: 15, scale: 0 }).notNull(),
  positionLimitJson: text("position_limit_json").notNull(),
  maxFilesPerRequest: integer("max_files_per_request").notNull().default(10),
  maxFileSizeMb: integer("max_file_size_mb").notNull().default(5),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

export const settingsBusinessTripAllowance = pgTable(
  "settings_business_trip_allowance",
  {
    id: text("id").primaryKey(),
    allowanceRuleJson: text("allowance_rule_json").notNull(),
    mealPerDay: numeric("meal_per_day", { precision: 15, scale: 0 }).notNull().default("50000"),
    laundryAmount: numeric("laundry_per_week", { precision: 15, scale: 0 }).notNull().default("30000"),
    laundryMinDays: integer("laundry_min_days").notNull().default(7),
    transportOptionJson: text("transport_option_json").notNull().default("[]"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  }
);

export const employees = pgTable(
  "employees",
  {
    id: text("id").primaryKey(),
    employeeCode: text("employee_code").notNull(),
    fullName: text("full_name"),
    nip: text("nip"),
    gender: text("gender"),
    title: text("title"),
    department: text("department"),
    workLocation: text("work_location"),
    phone: text("phone"),
    email: text("email"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    employeeCodeUnique: uniqueIndex("employees_employee_code_unique").on(table.employeeCode),
    nipUnique: uniqueIndex("employees_nip_unique").on(table.nip),
    emailUnique: uniqueIndex("employees_email_unique").on(table.email),
  })
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    attendanceDate: timestamp("attendance_date", { mode: "date" }).notNull(),
    checkInAt: timestamp("check_in_at", { mode: "date" }),
    checkOutAt: timestamp("check_out_at", { mode: "date" }),
    checkInLocation: text("check_in_location"),
    checkOutLocation: text("check_out_location"),
    status: text("status").notNull().default("PRESENT"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    attendanceUnique: uniqueIndex("attendance_records_employee_date_unique").on(
      table.employeeId,
      table.attendanceDate
    ),
    employeeIdIdx: index("attendance_records_employee_id_idx").on(table.employeeId),
    dateIdx: index("attendance_records_date_idx").on(table.attendanceDate),
  })
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveType: text("leave_type").notNull(),
    reason: text("reason").notNull(),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }).notNull(),
    status: text("status").notNull().default("SUBMITTED"),
    adminNote: text("admin_note"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    employeeIdIdx: index("leave_requests_employee_id_idx").on(table.employeeId),
    statusIdx: index("leave_requests_status_idx").on(table.status),
  })
);

export const businessTrips = pgTable(
  "business_trips",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    destinationCity: text("destination_city").notNull(),
    companyName: text("company_name").notNull(),
    purpose: text("purpose"),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }).notNull(),
    status: text("status").notNull().default("SUBMITTED"),
    adminNote: text("admin_note"),
    allowanceRuleId: text("allowance_rule_id"),
    allowanceRuleLabel: text("allowance_rule_label"),
    allowanceDaily: numeric("allowance_daily", { precision: 15, scale: 0 }),
    allowanceDays: integer("allowance_days"),
    allowanceTotal: numeric("allowance_total", { precision: 15, scale: 0 }),
    isOutOfTownOvernight: boolean("is_out_of_town_overnight").notNull().default(false),
    transportOptionId: text("transport_option_id"),
    compensationBreakdownJson: text("compensation_breakdown_json"),
    compensationTotal: numeric("compensation_total", { precision: 15, scale: 0 }),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    employeeIdIdx: index("business_trips_employee_id_idx").on(table.employeeId),
    statusIdx: index("business_trips_status_idx").on(table.status),
  })
);

export const reimbursements = pgTable(
  "reimbursements",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 15, scale: 0 }).notNull(),
    itemCount: integer("item_count").notNull().default(1),
    submissionDate: timestamp("submission_date", { mode: "date" }).notNull(),
    description: text("description"),
    receiptUrl: text("receipt_url"),
    status: text("status").notNull().default("SUBMITTED"),
    adminNote: text("admin_note"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    paidProofUrl: text("paid_proof_url"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    employeeIdIdx: index("reimbursements_employee_id_idx").on(table.employeeId),
    statusIdx: index("reimbursements_status_idx").on(table.status),
    submissionDateIdx: index("reimbursements_submission_date_idx").on(table.submissionDate),
  })
);

export const reimbursementItems = pgTable(
  "reimbursement_items",
  {
    id: text("id").primaryKey(),
    reimbursementId: text("reimbursement_id")
      .notNull()
      .references(() => reimbursements.id),
    expenseDate: timestamp("expense_date", { mode: "date" }).notNull(),
    category: text("category").notNull(),
    clientName: text("client_name"),
    description: text("description"),
    amount: numeric("amount", { precision: 15, scale: 0 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    reimbursementIdIdx: index("reimbursement_items_reimbursement_id_idx").on(
      table.reimbursementId
    ),
    expenseDateIdx: index("reimbursement_items_expense_date_idx").on(table.expenseDate),
  })
);

export const reimbursementAttachments = pgTable(
  "reimbursement_attachments",
  {
    id: text("id").primaryKey(),
    reimbursementId: text("reimbursement_id")
      .notNull()
      .references(() => reimbursements.id),
    reimbursementItemId: text("reimbursement_item_id").references(
      () => reimbursementItems.id
    ),
    purpose: text("purpose").notNull(),
    fileUrl: text("file_url").notNull(),
    fileKey: text("file_key"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    fileSize: integer("file_size"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    reimbursementIdIdx: index("reimbursement_attachments_reimbursement_id_idx").on(
      table.reimbursementId
    ),
    reimbursementItemIdIdx: index("reimbursement_attachments_reimbursement_item_id_idx").on(
      table.reimbursementItemId
    ),
    purposeIdx: index("reimbursement_attachments_purpose_idx").on(table.purpose),
  })
);

export const workflowEvents = pgTable(
  "workflow_events",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    entityId: text("entity_id").notNull(),
    level: integer("level"),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    actorUserId: text("actor_user_id").references(() => users.id),
    actorEmployeeId: text("actor_employee_id").references(() => employees.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    moduleEntityIdx: index("workflow_events_module_entity_idx").on(
      table.module,
      table.entityId
    ),
    createdAtIdx: index("workflow_events_created_at_idx").on(table.createdAt),
  })
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    readAt: timestamp("read_at", { mode: "date" }),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
    unreadIdx: index("notifications_user_unread_created_idx").on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
  })
);
