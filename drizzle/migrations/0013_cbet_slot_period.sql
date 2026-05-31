-- 0013_cbet_slot_period
-- Fix the slot definition: a CBET assessment slot is per ACADEMIC PERIOD. The
-- 0012 unit-scoped unique index keyed only (student, unit, type, assess#, prac#)
-- and omitted academic_year/semester — but the upload route's supersede lookup
-- AND the reviewer completeness matrix both scope a current document by period.
-- That mismatch made a legitimate cross-period retake (same slot, new year/sem)
-- collide on the index → 500, and would otherwise have forced a cross-period
-- overwrite (losing the prior period's current evidence). Recreate the index
-- WITH the period so index ↔ supersede ↔ completeness agree, and each period
-- keeps exactly one current document per slot.
--
-- COALESCE(...,0) on academic_year/semester so any legacy NULL-period current
-- rows collapse to a single bucket rather than being treated as always-distinct.
-- Idempotent + guarded (skips recreation if legacy duplicates exist).

DROP INDEX IF EXISTS "student_uploads_one_current_per_unit_slot";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'student_uploads_one_current_per_unit_slot') THEN
        IF NOT EXISTS (
            SELECT 1 FROM "student_uploads"
            WHERE "status" = 'uploaded' AND "unit_id" IS NOT NULL
            GROUP BY "student_id", "unit_id", "upload_type",
                     COALESCE("academic_year", 0), COALESCE("semester", 0),
                     COALESCE("assessment_number", 0), COALESCE("practical_number", 0)
            HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX "student_uploads_one_current_per_unit_slot"
                ON "student_uploads" (
                    "student_id", "unit_id", "upload_type",
                    (COALESCE("academic_year", 0)), (COALESCE("semester", 0)),
                    (COALESCE("assessment_number", 0)), (COALESCE("practical_number", 0))
                )
                WHERE "status" = 'uploaded' AND "unit_id" IS NOT NULL;
        ELSE
            RAISE NOTICE 'Skipped student_uploads_one_current_per_unit_slot (period-scoped): duplicate uploaded rows exist; resolve then re-run.';
        END IF;
    END IF;
END $$;
