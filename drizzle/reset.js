/**
 * EDTTI UMS — catalog reset.
 *
 * Clean wipe of the program catalog and every row that references it, in
 * FK-safe order. Used by the wipe-and-reseed (drizzle/seed.js calls
 * resetCatalog(); `npm run db:reset` runs this file standalone).
 *
 * Scope (per the wipe-and-reseed decision — dev/demo data):
 *   - catalog rows:    units, programs, departments
 *   - dependent rows:  unit_registrations, trainer_assignments,
 *                      common_unit_assignments, student_enrollments
 *   - demo students:   students (+ CASCADE clears their payments, notes,
 *                      uploads, attachment/graduation applications)
 * The seed re-creates the test "replica" students on the new programs.
 * Staff / HOD / trainer users and payslips are NOT touched.
 */
require('../src/config/env'); // validate env first
const { client } = require('../src/db');

// TRUNCATE ... CASCADE clears the catalog and anything FK-referencing it in one
// shot; RESTART IDENTITY resets any serial counters. Listed dependents are named
// explicitly so the intent is auditable even though CASCADE would reach them.
async function resetCatalog() {
    // SAFETY: this TRUNCATEs students + catalog + dependents. Never let it run
    // against a production database by accident.
    if (String(process.env.NODE_ENV).toLowerCase() === 'production' && process.env.ALLOW_DESTRUCTIVE_RESET !== 'true') {
        throw new Error('Refusing to run destructive catalog/student reset in production. Set ALLOW_DESTRUCTIVE_RESET=true to override intentionally.');
    }

    // Ensure the units.module column exists (Rule 6: units carry a module number).
    // Done here idempotently so a fresh checkout can seed without a separate
    // drizzle-kit migration step.
    await client`ALTER TABLE units ADD COLUMN IF NOT EXISTS module integer`;

    await client`
        TRUNCATE TABLE
            unit_registrations,
            trainer_assignments,
            common_unit_assignments,
            student_enrollments,
            students,
            units,
            programs,
            departments
        RESTART IDENTITY CASCADE
    `;
    console.log('  ✓ catalog + demo students wiped (CASCADE cleared dependents)');
}

module.exports = { resetCatalog };

// Allow standalone run: `node drizzle/reset.js`
if (require.main === module) {
    resetCatalog()
        .then(async () => {
            console.log('✅ Reset complete.');
            await client.end({ timeout: 5 });
        })
        .catch(async (err) => {
            console.error('❌ Reset failed:', err);
            try { await client.end({ timeout: 5 }); } catch (_) { /* */ }
            process.exit(1);
        });
}
