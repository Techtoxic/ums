/**
 * EDTTI UMS — private trainer/HOD seeder.
 *
 * Reads REAL staff names from drizzle/private/trainers.local.json (git-ignored,
 * never committed — PII/lawsuit risk) and upserts them into the `users` table.
 * The data file is loaded at runtime only; this script and the .example template
 * are the only tracked artifacts, so no real name ever reaches version control.
 *
 *   node drizzle/seedTrainers.js
 *
 * Behaviour:
 *   - Each entry is upserted by email (insert if new, else update name/department/
 *     role/phone/staff_id and re-activate). Passwords are set ONLY on insert (an
 *     existing trainer keeps whatever password they already chose) unless the
 *     entry carries an explicit `password`.
 *   - "Replace" semantics: when deactivateOthers !== false, every other
 *     role IN ('trainer','hod') user whose email is NOT in the list is
 *     soft-deactivated (is_active=false, deleted_at=now). Rows are never hard-
 *     deleted, so trainer_assignments / payslips foreign keys stay intact.
 */
require('../src/config/env'); // validate env first
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { eq, and, inArray, isNull, notInArray } = require('drizzle-orm');
const { db, client } = require('../src/db');
const { users } = require('./schema');
const { DEPT_TEXT_TO_SHORT } = require('../src/utils/formatters');

const BCRYPT_COST = 12;
const VALID_DEPTS = new Set(Object.keys(DEPT_TEXT_TO_SHORT));
const VALID_ROLES = new Set(['trainer', 'hod']);
const DATA_FILE = path.join(__dirname, 'private', 'trainers.local.json');

async function hash(pw) {
    return bcrypt.hash(pw, BCRYPT_COST);
}

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`\n❌ Missing data file: ${DATA_FILE}`);
        console.error('   Copy drizzle/private/trainers.example.json → trainers.local.json and fill in real data.\n');
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const list = Array.isArray(raw.trainers) ? raw.trainers : [];
    const defaultPassword = raw.defaultPassword || 'Trainer@2026';
    const deactivateOthers = raw.deactivateOthers !== false; // default true
    return { list, defaultPassword, deactivateOthers };
}

function validate(list) {
    const errors = [];
    const seenEmails = new Set();
    list.forEach((t, i) => {
        const where = `trainers[${i}]`;
        if (!t.name || !String(t.name).trim()) errors.push(`${where}: missing name`);
        const email = String(t.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`${where}: invalid/missing email`);
        else if (seenEmails.has(email)) errors.push(`${where}: duplicate email ${email}`);
        else seenEmails.add(email);
        if (!VALID_DEPTS.has(t.department)) errors.push(`${where}: department '${t.department}' is not one of ${[...VALID_DEPTS].join(', ')}`);
        const role = t.role || 'trainer';
        if (!VALID_ROLES.has(role)) errors.push(`${where}: role '${role}' must be 'trainer' or 'hod'`);
    });
    return errors;
}

async function upsertOne(t, defaultPassword) {
    const email = String(t.email).trim().toLowerCase();
    const role = t.role || 'trainer';
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (existing) {
        const set = {
            name: String(t.name).trim(),
            role,
            department: t.department,
            phone: t.phone || null,
            staff_id: t.staffId || null,
            is_active: true,
            deleted_at: null,
            updated_at: new Date(),
        };
        // Only reset the password if the entry explicitly provides one.
        if (t.password) set.password = await hash(t.password);
        await db.update(users).set(set).where(eq(users.id, existing.id));
        return { email, action: 'updated' };
    }

    await db.insert(users).values({
        email,
        role,
        name: String(t.name).trim(),
        password: await hash(t.password || defaultPassword),
        department: t.department,
        phone: t.phone || null,
        staff_id: t.staffId || null,
        is_active: true,
        is_first_login: false,
        must_update_email: false,
        must_update_password: false,
        email_verified: true,
    });
    return { email, action: 'inserted' };
}

async function main() {
    console.log('🌱 Seeding real trainers/HODs from private data file...');
    const { list, defaultPassword, deactivateOthers } = loadData();
    if (!list.length) {
        console.error('❌ No trainers found in data file.');
        process.exit(1);
    }
    const errors = validate(list);
    if (errors.length) {
        console.error('❌ Validation failed:\n  - ' + errors.join('\n  - '));
        process.exit(1);
    }

    const keepEmails = list.map(t => String(t.email).trim().toLowerCase());
    let inserted = 0, updated = 0;
    for (const t of list) {
        const r = await upsertOne(t, defaultPassword);
        if (r.action === 'inserted') inserted++; else updated++;
        console.log(`  ✓ ${r.action}: ${r.email} (${t.role || 'trainer'}, ${t.department})`);
    }

    let deactivated = 0;
    if (deactivateOthers) {
        // Only deactivate roles that the list actually supplies. If you provide
        // trainers but no HODs, existing HODs are left untouched (and vice-versa)
        // so "replace" never silently removes a role you didn't intend to manage.
        const rolesInList = [...new Set(list.map(t => t.role || 'trainer'))];
        const rows = await db.update(users)
            .set({ is_active: false, deleted_at: new Date(), updated_at: new Date() })
            .where(and(
                inArray(users.role, rolesInList),
                isNull(users.deleted_at),
                notInArray(users.email, keepEmails),
            ))
            .returning({ email: users.email, role: users.role });
        deactivated = rows.length;
        for (const r of rows) console.log(`  ⊘ deactivated (not in list): ${r.email} (${r.role})`);
    }

    console.log(`\n✅ Done. inserted=${inserted}, updated=${updated}, deactivated=${deactivated}`);
    await client.end({ timeout: 5 });
}

main().catch(async (err) => {
    console.error('❌ seedTrainers failed:', err);
    try { await client.end({ timeout: 5 }); } catch (_) { /* */ }
    process.exit(1);
});
