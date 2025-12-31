CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"company_address" text,
	"company_phone" text,
	"company_email" text,
	"company_logo_url" text,
	"numbering_prefix" text NOT NULL,
	"numbering_reset" text NOT NULL,
	"default_ppn_rate" numeric(5, 2) NOT NULL,
	"default_signer_name" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
