CREATE TABLE "overtime_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"employee_code" text NOT NULL,
	"client_id" text,
	"client_name" text NOT NULL,
	"overtime_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"ends_next_day" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"duration_minutes" integer NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"approver_level1_employee_id" text NOT NULL,
	"approver_level1_name" text NOT NULL,
	"approver_level2_employee_id" text NOT NULL,
	"approver_level2_name" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings_approval_flow" ADD COLUMN "overtime_approver_level1_employee_id" text;--> statement-breakpoint
ALTER TABLE "settings_approval_flow" ADD COLUMN "overtime_approver_level2_employee_id" text;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approver_level1_employee_id_employees_id_fk" FOREIGN KEY ("approver_level1_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approver_level2_employee_id_employees_id_fk" FOREIGN KEY ("approver_level2_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overtime_requests_employee_time_idx" ON "overtime_requests" USING btree ("employee_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "overtime_requests_status_date_idx" ON "overtime_requests" USING btree ("status","overtime_date");--> statement-breakpoint
CREATE INDEX "overtime_requests_approver1_idx" ON "overtime_requests" USING btree ("approver_level1_employee_id","status");--> statement-breakpoint
CREATE INDEX "overtime_requests_approver2_idx" ON "overtime_requests" USING btree ("approver_level2_employee_id","status");--> statement-breakpoint
CREATE INDEX "overtime_requests_client_idx" ON "overtime_requests" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "settings_approval_flow" ADD CONSTRAINT "settings_approval_flow_overtime_approver_level1_employee_id_employees_id_fk" FOREIGN KEY ("overtime_approver_level1_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_approval_flow" ADD CONSTRAINT "settings_approval_flow_overtime_approver_level2_employee_id_employees_id_fk" FOREIGN KEY ("overtime_approver_level2_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;