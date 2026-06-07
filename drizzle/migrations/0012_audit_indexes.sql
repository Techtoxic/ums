-- Migration 0012: indexes for polymorphic lookup tables flagged in the audit.
-- These tables intentionally have no FK (recipient/user is polymorphic across
-- users + students), so add indexes to avoid full scans on hot lookups.
-- Idempotent.

CREATE INDEX IF NOT EXISTS "idx_notifications_recipient" ON "notifications" ("recipient_type", "recipient_id");
CREATE INDEX IF NOT EXISTS "idx_password_resets_email" ON "password_resets" ("email");
CREATE INDEX IF NOT EXISTS "idx_password_resets_user_id" ON "password_resets" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_login_otps_email" ON "login_otps" ("email");
CREATE INDEX IF NOT EXISTS "idx_login_otps_user_id" ON "login_otps" ("user_id");
