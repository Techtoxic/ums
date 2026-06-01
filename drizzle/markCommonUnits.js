/**
 * EDTTI UMS — flag common units.
 *
 * Sets units.is_common = true for every unit whose name matches an entry in
 * drizzle/commonUnitsList.js (case-insensitive, whitespace-normalised), and
 * false for all others. Idempotent and fully reversible — re-run after editing
 * the list. Pair with the allocation rules in src/routes/assignments.js and
 * src/routes/commonUnits.js.
 *
 *   node drizzle/markCommonUnits.js          # apply
 *   node drizzle/markCommonUnits.js --dry    # preview only, no writes
 */
require('../src/config/env');
const { sql, inArray, eq, isNull, and } = require('drizzle-orm');
const { db, client } = require('../src/db');
const { units } = require('./schema');
const COMMON_NAMES = require('./commonUnitsList');

const DRY = process.argv.includes('--dry');
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();

async function main() {
    const wanted = new Set(COMMON_NAMES.map(norm));
    if (!wanted.size) {
        console.error('❌ commonUnitsList.js is empty — nothing to mark.');
        process.exit(1);
    }

    // Pull all live units and partition by normalised name.
    const rows = await db
        .select({ id: units.id, name: units.name, isCommon: units.is_common })
        .from(units)
        .where(isNull(units.deleted_at));

    const toCommon = [];
    const toRegular = [];
    const matchedNames = new Map();
    for (const r of rows) {
        const isWanted = wanted.has(norm(r.name));
        if (isWanted) {
            matchedNames.set(norm(r.name), (matchedNames.get(norm(r.name)) || 0) + 1);
            if (!r.isCommon) toCommon.push(r.id);
        } else if (r.isCommon) {
            toRegular.push(r.id);
        }
    }

    console.log(`Catalog units (live): ${rows.length}`);
    console.log('Matched common-unit names:');
    for (const name of wanted) {
        console.log(`  ${matchedNames.has(name) ? '✓' : '✗ (no units!)'} ${name} → ${matchedNames.get(name) || 0} unit(s)`);
    }
    console.log(`Will flag common: +${toCommon.length}, will revert to regular: -${toRegular.length}`);

    if (DRY) {
        console.log('\n(dry run — no changes written)');
        await client.end({ timeout: 5 });
        return;
    }

    const CHUNK = 500;
    for (let i = 0; i < toCommon.length; i += CHUNK) {
        await db.update(units).set({ is_common: true, updated_at: new Date() })
            .where(inArray(units.id, toCommon.slice(i, i + CHUNK)));
    }
    for (let i = 0; i < toRegular.length; i += CHUNK) {
        await db.update(units).set({ is_common: false, updated_at: new Date() })
            .where(inArray(units.id, toRegular.slice(i, i + CHUNK)));
    }

    const [{ count }] = await db.select({ count: sql`count(*)::int` }).from(units)
        .where(and(eq(units.is_common, true), isNull(units.deleted_at)));
    console.log(`\n✅ Done. Total common units now: ${count}`);
    await client.end({ timeout: 5 });
}

main().catch(async (err) => {
    console.error('❌ markCommonUnits failed:', err);
    try { await client.end({ timeout: 5 }); } catch (_) { /* */ }
    process.exit(1);
});
