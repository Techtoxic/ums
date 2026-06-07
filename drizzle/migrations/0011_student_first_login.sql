-- Migration 0011: student first-login columns.
-- Newly created students must change their initial password before using the
-- portal. Idempotent: safe to re-run.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "is_first_login" boolean DEFAULT false NOT NULL;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "must_update_password" boolean DEFAULT false NOT NULL;
