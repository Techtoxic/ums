/**
 * EDTTI UMS — re-code units to the course code.
 *
 * The original seed generated synthetic unit codes like "GA4-M1-01" where only
 * the "GA4" (course/level) prefix is meaningful — "M1" duplicated the module
 * (now its own field) and "01" was a meaningless counter. Per the institution,
 * the unit code IS the course code (e.g. "GA4"); units are told apart by name +
 * module. This rewrites units.code = programs.code and syncs the denormalized
 * student_uploads.unit_code. Idempotent — safe to re-run.
 *
 *   node drizzle/recodeUnits.js [--dry]
 */
require('../src/config/env');
const { sql } = require('drizzle-orm');
const { db, client } = require('../src/db');

const DRY = process.argv.includes('--dry');

async function main() {
    // Preview: how many unit codes still carry the old "-M…-…" suffix.
    const [{ before }] = await db.execute(sql`
        SELECT count(*)::int AS before
        FROM units u JOIN programs p ON p.id = u.program_id
        WHERE u.code IS DISTINCT FROM p.code AND u.deleted_at IS NULL
    `).then(r => r.rows ?? r);
    console.log(`Units whose code != course code: ${before}`);

    if (DRY) {
        console.log('(dry run — no changes written)');
        await client.end({ timeout: 5 });
        return;
    }

    // 1) Canonical: units.code = the owning program's code.
    const u = await db.execute(sql`
        UPDATE units SET code = p.code, updated_at = now()
        FROM programs p
        WHERE units.program_id = p.id AND units.code IS DISTINCT FROM p.code
    `);
    // 2) Denormalized copies on uploads follow the canonical unit code.
    const su = await db.execute(sql`
        UPDATE student_uploads su SET unit_code = u.code, updated_at = now()
        FROM units u
        WHERE su.unit_id = u.id AND su.unit_code IS DISTINCT FROM u.code
    `);

    console.log(`✅ Re-coded units: ${u.count ?? '?'} | synced upload unit_code: ${su.count ?? '?'}`);
    await client.end({ timeout: 5 });
}

main().catch(async (err) => {
    console.error('❌ recodeUnits failed:', err);
    try { await client.end({ timeout: 5 }); } catch (_) { /* */ }
    process.exit(1);
});
