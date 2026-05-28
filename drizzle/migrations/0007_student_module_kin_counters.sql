-- 0007: students.year -> students.module rename, next-of-kin columns,
-- per-column unique indexes on phone_number and email, 'may' intake value,
-- and an admission_number_counter table for globally unique admission numbers.
-- Every statement is idempotent so this migration is safe to run on databases
-- that already received an equivalent change out-of-band.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'students'
           AND column_name = 'year'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'students'
           AND column_name = 'module'
    ) THEN
        EXECUTE 'ALTER TABLE "students" RENAME COLUMN "year" TO "module"';
    END IF;
END$$;--> statement-breakpoint

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "next_of_kin_name" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "next_of_kin_phone" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "students_phone_number_unique" ON "students" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "students_email_unique" ON "students" USING btree ("email");--> statement-breakpoint

ALTER TYPE "public"."intake" ADD VALUE IF NOT EXISTS 'may';--> statement-breakpoint

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'students'
           AND indexname = 'students_year_intake_year_idx'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'students'
           AND indexname = 'students_module_intake_year_idx'
    ) THEN
        EXECUTE 'ALTER INDEX "students_year_intake_year_idx" RENAME TO "students_module_intake_year_idx"';
    END IF;
END$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "students_module_intake_year_idx" ON "students" USING btree ("module","intake_year");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admission_number_counter" (
    "id" integer PRIMARY KEY,
    "next_number" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

INSERT INTO "admission_number_counter" ("id", "next_number")
VALUES (1, 2500)
ON CONFLICT ("id") DO NOTHING;
