CREATE TABLE "document_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ope_documents_sequence_unique";
--> statement-breakpoint
-- Seed the shared yearly high-water mark without renumbering any business record.
INSERT INTO "document_number_counters" ("year", "last_seq")
SELECT split_part(number, '/', 4)::integer,
       max(split_part(split_part(number, '/', 1), '.', 2)::numeric)::integer
FROM (
  SELECT "invoice_number" AS number FROM "invoices"
  UNION ALL
  SELECT "document_number" AS number FROM "ope_documents"
) AS existing_numbers
WHERE number ~ '^I\.[0-9]+/ARM/[IVX]+/[0-9]{4}$'
GROUP BY split_part(number, '/', 4)::integer;
