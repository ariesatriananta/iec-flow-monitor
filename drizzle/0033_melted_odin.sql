CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"actor_user_id" text,
	"actor_name" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_module_entity_idx" ON "audit_logs" USING btree ("module","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");