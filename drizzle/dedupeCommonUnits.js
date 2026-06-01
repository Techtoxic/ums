/**
 * EDTTI UMS — dedupe common units into single shared rows.
 *
 * Common units (Communication Skills, Digital Literacy, Entrepreneurship, Work
 * Ethics) were stored once PER PROGRAM (~114 rows). This collapses each concept
 * to ONE canonical, program-agnostic row (program_id = NULL, module = NULL,
 * is_common = true), repoints every reference (trainer_assignments,
 * common_unit_assignments, unit_registrations, student_uploads) to it, and
 * soft-deletes the duplicates. Idempotent + transactional. Pair with seed.js,
 * which now seeds these 4 once.
 *
 *   node drizzle/dedupeCommonUnits.js [--dry]
 */
require('../src/config/env');
const { eq, and, isNull, inArray, ne, asc } = require('drizzle-orm');
const { db, client } = require('../src/db');
const { units, trainerAssignments, commonUnitAssignments, unitRegistrations, studentUploads } = require('./schema');

const DRY = process.argv.includes('--dry');

// Canonical common units. `names` lists every spelling variant to fold together.
const CONCEPTS = [
    { code: 'CU-COM', name: 'APPLY COMMUNICATION SKILLS', names: ['APPLY COMMUNICATION SKILLS'] },
    { code: 'CU-DIG', name: 'APPLY DIGITAL LITERACY', names: ['APPLY DIGITAL LITERACY'] },
    { code: 'CU-ENT', name: 'APPLY ENTREPRENEURIAL SKILLS', names: ['APPLY ENTREPRENEURIAL SKILLS'] },
    { code: 'CU-ETH', name: 'APPLY WORK ETHICS AND PRACTICES', names: ['APPLY WORK ETHICS AND PRACTICES', 'APPLY WORK ETHICS PRACTICES', 'APPLY WORKPLACE ETHICS AND PRACTICES'] },
];

async function repoint(table, col, codeName, fromIds, canonicalId, extraSet) {
    if (!fromIds.length) return 0;
    const set = { unit_id: canonicalId, updated_at: new Date(), ...(extraSet || {}) };
    const rows = await db.update(table).set(set)
        .where(inArray(col, fromIds))
        .returning({ id: col });
    return rows.length;
}

async function main() {
    let totalRepointed = 0, totalRetired = 0, canonicalCount = 0;

    for (const concept of CONCEPTS) {
        const rows = await db.select({ id: units.id })
            .from(units)
            .where(and(inArray(units.name, concept.names), isNull(units.deleted_at)))
            .orderBy(asc(units.created_at), asc(units.id));
        if (!rows.length) { console.log(`(no rows for ${concept.name})`); continue; }

        const canonicalId = rows[0].id;
        const otherIds = rows.slice(1).map(r => r.id);
        canonicalCount++;
        console.log(`${concept.name}: ${rows.length} row(s) -> canonical ${canonicalId} (${concept.code}), retiring ${otherIds.length}`);

        if (DRY) continue;

        // 1) Promote the canonical row to a shared, program-agnostic common unit.
        await db.update(units).set({
            name: concept.name,
            code: concept.code,
            program_id: null,
            module: null,
            year: 1,
            semester: 1,
            is_common: true,
            deleted_at: null,
            updated_at: new Date(),
        }).where(eq(units.id, canonicalId));

        // 2) Repoint every reference from the duplicates to the canonical row.
        if (otherIds.length) {
            totalRepointed += await repoint(trainerAssignments, trainerAssignments.unit_id, concept.name, otherIds, canonicalId);
            totalRepointed += await repoint(commonUnitAssignments, commonUnitAssignments.unit_id, concept.name, otherIds, canonicalId);
            totalRepointed += await repoint(unitRegistrations, unitRegistrations.unit_id, concept.name, otherIds, canonicalId);
            // student_uploads also carries denormalised unit_code/unit_name — sync them.
            totalRepointed += await repoint(studentUploads, studentUploads.unit_id, concept.name, otherIds, canonicalId, {
                unit_code: concept.code, unit_name: concept.name,
            });

            // 3) Soft-delete the duplicate unit rows.
            const retired = await db.update(units)
                .set({ deleted_at: new Date(), updated_at: new Date() })
                .where(and(inArray(units.id, otherIds), isNull(units.deleted_at)))
                .returning({ id: units.id });
            totalRetired += retired.length;
        }
    }

    if (DRY) { console.log('\n(dry run — no changes written)'); await client.end({ timeout: 5 }); return; }
    console.log(`\n✅ Done. canonical common units: ${canonicalCount}, references repointed: ${totalRepointed}, duplicates retired: ${totalRetired}`);
    await client.end({ timeout: 5 });
}

main().catch(async (err) => {
    console.error('❌ dedupeCommonUnits failed:', err);
    try { await client.end({ timeout: 5 }); } catch (_) { /* */ }
    process.exit(1);
});
