-- 0008: payslips.generated_by (the finance officer who generated the batch) and
-- a revenue_entries table for non-tuition institutional income (farm sales, bus
-- rental, hall hire, ...). Every statement is idempotent so this migration is
-- safe to run on databases that already received an equivalent change.

ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "generated_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payslips" ADD CONSTRAINT "payslips_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "revenue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"source" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_entries_created_at_idx" ON "revenue_entries" USING btree ("created_at");
