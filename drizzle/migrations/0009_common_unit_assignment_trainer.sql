-- 0009: make common_unit_assignments support HOD trainer assignments.
-- The V2 table only had (unit_id, program_id) which could not back the HOD
-- "assign common unit to trainer" feature. Add the trainer/assigner columns,
-- a status + soft-delete, and relax program_id (the HOD flow does not set it).
-- Every statement is idempotent so this is safe to re-run.

ALTER TABLE "common_unit_assignments" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "trainer_id" uuid;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "assigned_by" uuid;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "assigned_by_department" text;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "trainer_department" text;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "common_unit_assignments" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "common_unit_assignments" ADD CONSTRAINT "common_unit_assignments_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "common_unit_assignments" ADD CONSTRAINT "common_unit_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "common_unit_assignments_trainer_id_idx" ON "common_unit_assignments" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "common_unit_assignments_dept_idx" ON "common_unit_assignments" USING btree ("assigned_by_department");
