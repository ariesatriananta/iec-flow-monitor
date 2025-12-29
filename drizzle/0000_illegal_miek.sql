CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"pic_name" text,
	"email" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_date" timestamp NOT NULL,
	"client_id" text NOT NULL,
	"service_code" text NOT NULL,
	"engagement_no" integer NOT NULL,
	"seq_no" integer NOT NULL,
	"proposal_number" text NOT NULL,
	"contract_title" text,
	"contract_value" numeric(15, 0) NOT NULL,
	"payment_status" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_date" timestamp NOT NULL,
	"contract_id" text NOT NULL,
	"termin_id" text NOT NULL,
	"seq_no" integer NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" numeric(15, 0) NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"id" text PRIMARY KEY NOT NULL,
	"letter_date" timestamp NOT NULL,
	"client_id" text NOT NULL,
	"letter_type" text NOT NULL,
	"subject" text NOT NULL,
	"seq_no" integer NOT NULL,
	"letter_number" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "termins" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"termin_name" text NOT NULL,
	"termin_amount" numeric(15, 0) NOT NULL,
	"due_date" timestamp,
	"invoice_id" text,
	"payment_received_date" timestamp,
	"status" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_termin_id_termins_id_fk" FOREIGN KEY ("termin_id") REFERENCES "public"."termins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termins" ADD CONSTRAINT "termins_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_code_unique" ON "clients" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_proposal_number_unique" ON "contracts" USING btree ("proposal_number");--> statement-breakpoint
CREATE INDEX "contracts_client_id_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_contract_id_idx" ON "invoices" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "invoices_termin_id_idx" ON "invoices" USING btree ("termin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "letters_letter_number_unique" ON "letters" USING btree ("letter_number");--> statement-breakpoint
CREATE INDEX "letters_client_id_idx" ON "letters" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "termins_contract_id_idx" ON "termins" USING btree ("contract_id");