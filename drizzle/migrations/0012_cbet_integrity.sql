-- 0012_cbet_integrity
-- CBET evidence-store integrity: snapshot the student's cohort (intake/intake_year)
-- onto each upload at write time, add a content hash for integrity + duplicate
-- detection, add the indexes the reviewer tree / completeness / search queries need,
-- and guarantee exactly one CURRENT document per assessment slot.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS / guarded DDL), safe to re-run.
-- NO verification/review-status columns are added — the existing `status` column
-- (uploaded | replaced | deleted) is the only document state (versioning + soft-delete).
-- Historical rows are NOT forced NOT NULL; completeness is enforced at the API.

-- 1. Cohort snapshot + integrity hash --------------------------------------
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "intake" text;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "intake_year" integer;
ALTER TABLE "student_uploads" ADD COLUMN IF NOT EXISTS "content_hash" text;

-- 2. Supporting indexes for the tree / completeness / search ----------------
CREATE INDEX IF NOT EXISTS "student_uploads_course_intake_module_unit_idx"
    ON "student_uploads" ("course", "intake_year", "module", "unit_id");
CREATE INDEX IF NOT EXISTS "student_uploads_unit_year_sem_status_idx"
    ON "student_uploads" ("unit_id", "academic_year", "semester", "status");
CREATE INDEX IF NOT EXISTS "student_uploads_admission_number_idx"
    ON "student_uploads" ("admission_number");
CREATE INDEX IF NOT EXISTS "student_uploads_content_hash_idx"
    ON "student_uploads" ("content_hash");

-- 3. Exactly one CURRENT (status='uploaded') document per slot --------------
-- Partial unique indexes. Created only when no historical duplicates exist so an
-- additive deploy never fails on legacy data; if duplicates are present the index
-- is skipped with a NOTICE (resolve, then re-run this migration).

-- 3a. Unit-scoped slots: (student, unit, type, assessment#, practical#).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'student_uploads_one_current_per_unit_slot') THEN
        IF NOT EXISTS (
            SELECT 1 FROM "student_uploads"
            WHERE "status" = 'uploaded' AND "unit_id" IS NOT NULL
            GROUP BY "student_id", "unit_id", "upload_type",
                     COALESCE("assessment_number", 0), COALESCE("practical_number", 0)
            HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX "student_uploads_one_current_per_unit_slot"
                ON "student_uploads" (
                    "student_id", "unit_id", "upload_type",
                    (COALESCE("assessment_number", 0)), (COALESCE("practical_number", 0))
                )
                WHERE "status" = 'uploaded' AND "unit_id" IS NOT NULL;
        ELSE
            RAISE NOTICE 'Skipped student_uploads_one_current_per_unit_slot: duplicate uploaded rows exist; resolve then re-run.';
        END IF;
    END IF;
END $$;

-- 3b. Student-level slots (profile_photo / kcse_results / kcpe_results): (student, type).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'student_uploads_one_current_per_student_slot') THEN
        IF NOT EXISTS (
            SELECT 1 FROM "student_uploads"
            WHERE "status" = 'uploaded' AND "unit_id" IS NULL
            GROUP BY "student_id", "upload_type"
            HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX "student_uploads_one_current_per_student_slot"
                ON "student_uploads" ("student_id", "upload_type")
                WHERE "status" = 'uploaded' AND "unit_id" IS NULL;
        ELSE
            RAISE NOTICE 'Skipped student_uploads_one_current_per_student_slot: duplicate uploaded rows exist; resolve then re-run.';
        END IF;
    END IF;
END $$;
