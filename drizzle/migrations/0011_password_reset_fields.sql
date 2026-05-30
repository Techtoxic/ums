-- 0011_password_reset_fields
-- The V2 password_resets table only had id/email/token_hash/expires_at/used_at/
-- timestamps, so a reset couldn't identify which account to update and the route
-- (written for a richer V1 model) crashed. Add the missing fields.
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS), safe to re-run.
--
-- user_id has NO foreign key on purpose: it references users.id OR students.id,
-- disambiguated by user_role.

ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "user_role" text;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "reset_type" text;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
