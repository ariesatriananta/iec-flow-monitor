CREATE TABLE "consolidated_letter_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letters" ADD COLUMN "opinion_date" date;--> statement-breakpoint
ALTER TABLE "letters" ADD COLUMN "opinion_number" text;