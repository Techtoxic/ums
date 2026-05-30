/**
 * reset-student-passwords.js — idempotent maintenance script.
 *
 * Makes the phone number the working default login credential for EVERY student,
 * matching how students are seeded and how the registrar admission flow now
 * creates them. Students admitted before that fix were given an undeliverable
 * random password and could not log in; this resets any such student so they can
 * log in with their admission number + phone number.
 *
 * SAFE + IDEMPOTENT: a student is only updated when their current password does
 * NOT already verify against their phone number, so re-running is a no-op for
 * students who already use the phone-number default (incl. seeded students and
 * any student who later set a custom password that happens to be their phone).
 *
 * Usage:  node drizzle/reset-student-passwords.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, schema } = require('../src/db');
const { isNull } = require('drizzle-orm');
const { eq } = require('drizzle-orm');

async function main() {
    const rows = await db
        .select({ id: schema.students.id, admission_number: schema.students.admission_number, phone_number: schema.students.phone_number, password: schema.students.password })
        .from(schema.students)
        .where(isNull(schema.students.deleted_at));

    let reset = 0;
    let ok = 0;
    for (const s of rows) {
        const phone = String(s.phone_number || '').trim();
        if (!phone) continue;
        const alreadyPhone = s.password ? await bcrypt.compare(phone, s.password) : false;
        if (alreadyPhone) { ok++; continue; }
        const hashed = await bcrypt.hash(phone, 10);
        await db.update(schema.students).set({ password: hashed, updated_at: new Date() }).where(eq(schema.students.id, s.id));
        reset++;
        console.log(`  reset password -> phone for ${s.admission_number}`);
    }
    console.log(`Done. ${rows.length} students checked, ${ok} already used phone, ${reset} reset.`);
    process.exit(0);
}

main().catch((e) => { console.error('reset-student-passwords failed:', e.message); process.exit(1); });
