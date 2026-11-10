CREATE TABLE "ope_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"document_date" timestamp NOT NULL,
	"document_number" text NOT NULL,
	"seq_no" integer NOT NULL,
	"number_year" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"client_id" text,
	"client_snapshot" jsonb,
	"subject" text NOT NULL,
	"notes" text,
	"ppn_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"pph23_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(15, 0) NOT NULL,
	"ppn_amount" numeric(15, 0) NOT NULL,
	"pph23_amount" numeric(15, 0) NOT NULL,
	"total" numeric(15, 0) NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ope_items" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"position" integer NOT NULL,
	"employee_id" text,
	"employee_name" text,
	"days" integer,
	"rate" numeric(15, 0),
	"expense_date" timestamp,
	"client_id" text,
	"client_snapshot" jsonb,
	"description" text NOT NULL,
	"amount" numeric(15, 0) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ope_documents" ADD CONSTRAINT "ope_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ope_items" ADD CONSTRAINT "ope_items_document_id_ope_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ope_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ope_items" ADD CONSTRAINT "ope_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ope_items" ADD CONSTRAINT "ope_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ope_documents_number_unique" ON "ope_documents" USING btree ("document_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ope_documents_sequence_unique" ON "ope_documents" USING btree ("type","number_year","seq_no");--> statement-breakpoint
CREATE INDEX "ope_documents_type_created_idx" ON "ope_documents" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "ope_documents_client_idx" ON "ope_documents" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ope_items_document_position_unique" ON "ope_items" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "ope_items_client_idx" ON "ope_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ope_items_employee_idx" ON "ope_items" USING btree ("employee_id");