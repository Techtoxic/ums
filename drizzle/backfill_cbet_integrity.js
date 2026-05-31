/**
 * One-off, idempotent backfill for the CBET integrity columns added in
 * migration 0012 (intake, intake_year, content_hash).
 *
 *   node drizzle/backfill_cbet_integrity.js
 *
 * SAFE TO RE-RUN. It ONLY fills NULLs — it never alters status, version, s3_key,
 * or any existing bytes. Two independent passes:
 *
 *   1. intake / intake_year  — copied from the owning students row (single SQL
 *      UPDATE ... FROM students, only where the upload's value is NULL).
 *   2. content_hash          — SHA-256 of the stored S3 object, computed only for
 *      rows that still lack a hash and have an s3_key. Missing/unreadable objects
 *      are logged and skipped (never fatal). Deleted rows are still hashed — their
 *      bytes are retained as the immutable audit record.
 */
require('dotenv').config();
const crypto = require('crypto');
const { eq, and, isNull, isNotNull, sql } = require('drizzle-orm');
const { db, schema } = require('../src/db');
const { getFileFromS3, isS3Configured } = require('../src/utils/s3Service');

const U = schema.studentUploads;

async function backfillCohort() {
    // Fill intake + intake_year from the owning student, only where NULL.
    const res = await db.execute(sql`
        UPDATE student_uploads u
        SET intake = COALESCE(u.intake, s.intake::text),
            intake_year = COALESCE(u.intake_year, s.intake_year),
            updated_at = now()
        FROM students s
        WHERE u.student_id = s.id
          AND (u.intake_year IS NULL OR u.intake IS NULL)
    `);
    const n = (res && (res.count ?? res.rowCount)) || 0;
    console.log(`[cohort] rows updated with intake/intake_year: ${n}`);
}

async function backfillHashes() {
    if (!isS3Configured()) {
        console.warn('[hash] S3 not configured — skipping content_hash backfill.');
        return;
    }
    const rows = await db
        .select({ id: U.id, s3Key: U.s3_key })
        .from(U)
        .where(and(isNull(U.content_hash), isNotNull(U.s3_key)));

    console.log(`[hash] candidates needing content_hash: ${rows.length}`);
    let hashed = 0, skipped = 0;
    for (const row of rows) {
        try {
            const buf = await getFileFromS3(row.s3Key);
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            await db.update(U).set({ content_hash: hash, updated_at: new Date() }).where(eq(U.id, row.id));
            hashed++;
        } catch (err) {
            // Object missing / unreadable — log and continue (never fail the run).
            skipped++;
            console.warn(`[hash] skipped ${row.id} (key=${row.s3Key}): ${err.message}`);
        }
    }
    console.log(`[hash] hashed: ${hashed}, skipped: ${skipped}`);
}

(async () => {
    try {
        console.log('CBET integrity backfill starting…');
        await backfillCohort();
        await backfillHashes();
        console.log('CBET integrity backfill complete.');
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
})();
