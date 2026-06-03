-- Migration 0010: unit_books — trainer-approved book resources per unit.
-- Sourced from OpenStax + Gutendex, normalized to one flat shape.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "unit_books" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "unit_id"      uuid NOT NULL,
    "approved_by"  uuid NOT NULL,
    "external_id"  text NOT NULL,
    "source"       text NOT NULL,
    "title"        text NOT NULL,
    "authors"      text[],
    "cover_url"    text,
    "description"  text,
    "subject"      text,
    "pdf_url"      text,
    "preview_url"  text,
    "language"     text DEFAULT 'en',
    "approved_at"  timestamptz DEFAULT now() NOT NULL,
    "is_active"    boolean DEFAULT true NOT NULL,
    "created_at"   timestamptz DEFAULT now() NOT NULL,
    "updated_at"   timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "unit_books"
        ADD CONSTRAINT "unit_books_unit_id_units_id_fk"
        FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "unit_books"
        ADD CONSTRAINT "unit_books_approved_by_users_id_fk"
        FOREIGN KEY ("approved_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_unit_books_unit_id" ON "unit_books" ("unit_id");
CREATE INDEX IF NOT EXISTS "idx_unit_books_source" ON "unit_books" ("source");
CREATE UNIQUE INDEX IF NOT EXISTS "unit_books_unit_external_source_unique"
    ON "unit_books" ("unit_id", "external_id", "source");
