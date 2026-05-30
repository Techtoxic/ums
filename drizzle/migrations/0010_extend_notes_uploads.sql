-- 0010_extend_notes_uploads
-- Adds the V1 metadata columns the route handlers persist but the lean V2 tables
-- lacked (Drizzle silently dropped them, causing data loss / NOT NULL failures).
-- All additive + idempotent (ADD COLUMN IF NOT EXISTS), so safe to re-run.

-- student_notes: note typing + denormalised display fields.
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "note_type" text;
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "priority" text;
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "student_name" text;
ALTER TABLE "student_notes" ADD COLUMN IF NOT EXISTS "admission_number" text;

-- student_uploads: upload typing, unit linkage, S3 keys, versioning/replacement,
-- academic period, denormalised student fields.
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "upload_type" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "unit_id" uuid;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "unit_code" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "unit_name" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "original_file_name" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "s3_key" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "s3_bucket" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "replaces" uuid;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "academic_year" integer;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "semester" integer;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "student_name" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "admission_number" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "course" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "module" integer;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "assessment_number" integer;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "practical_number" integer;
