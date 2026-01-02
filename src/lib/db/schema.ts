import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const clients = pgTable(
  "clients",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
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

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    usernameUnique: uniqueIndex("users_username_unique").on(table.username),
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
