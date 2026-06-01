/**
 * EDTTI UMS — V2 seed script (clean wipe + reseed).
 *
 * Runs resetCatalog() FIRST (drops departments/programs/units + dependent rows),
 * then reseeds the whole catalog from drizzle/catalogData.js — the verbatim
 * transcription of "COURSES PRESENT AND THEIR CODES.docx".
 *
 *   node drizzle/seed.js
 *
 * Catalog rules baked in here:
 *   - 7 departments, 18 courses, 48 program-levels (one program per code level).
 *   - Every program costs KES 67,189.
 *   - Units are seeded PER LEVEL (duplicate-per-level): a level program holds
 *     modules 1..cap(level) where cap = MAX_MODULE_BY_LEVEL; the highest-level
 *     program of each course holds ALL its modules so no unit is lost. The
 *     backend hides modules above cap(level) at runtime.
 *
 * NOTE on passwords:
 *   V1 bcrypt hashes are not reachable from this environment, so the documented
 *   defaults (Admin@2026 / Trainer@2026 / Mt5@2026 / phone-number-as-password)
 *   are hashed fresh at cost 12. Users will need to use these passwords on first
 *   V2 login. The is_first_login flag is FALSE per the prompt for ease of testing.
 */
require('../src/config/env'); // validate env first
const bcrypt = require('bcryptjs');
const { eq } = require('drizzle-orm');
const { db, client } = require('../src/db');
const {
    departments,
    programs,
    units,
    users,
    students,
    payments,
    payslips,
} = require('./schema');
const { DEPARTMENTS, COURSES } = require('./catalogData');
const { resetCatalog } = require('./reset');
const { MAX_MODULE_BY_LEVEL } = require('../src/utils/studentHelpers');

const BCRYPT_COST = 12;
const DEFAULT_PROGRAM_COST = '67189';

async function hash(pw) {
    return bcrypt.hash(pw, BCRYPT_COST);
}

/** Insert a row only if a row matching `whereClause` doesn't already exist.
 *  Returns the existing or newly-inserted row. */
async function upsert(table, whereClause, values) {
    const existing = await db.select().from(table).where(whereClause).limit(1);
    if (existing.length) return existing[0];
    const inserted = await db.insert(table).values(values).returning();
    return inserted[0];
}

async function seedDepartments() {
    // Catalog was just truncated, so bulk-insert (one round trip) instead of
    // per-row upserts. Returning() gives us the new ids keyed by textCode.
    const rows = await db.insert(departments).values(
        DEPARTMENTS.map((d) => ({ name: d.name, code: d.code })),
    ).returning();
    const rowByCode = {};
    for (const r of rows) rowByCode[r.code] = r;
    const out = {};
    for (const d of DEPARTMENTS) out[d.textCode] = rowByCode[d.code];
    console.log(`  ✓ departments: ${rows.length}`);
    return out;
}

async function seedPrograms(deptByText) {
    const values = [];
    for (const course of COURSES) {
        for (const level of course.levels) {
            const dept = deptByText[course.department];
            if (!dept) throw new Error(`Unknown department '${course.department}' for course ${course.name}`);
            values.push({
                code: `${course.codePrefix}${level}`,
                name: `${course.name} Level ${level}`,
                level,
                department_id: dept.id,
                program_cost: DEFAULT_PROGRAM_COST,
                duration_years: 3,
                is_active: true,
            });
        }
    }
    const rows = await db.insert(programs).values(values).returning();
    const out = {};
    for (const r of rows) out[r.code] = r;
    console.log(`  ✓ programs: ${rows.length}`);
    return out;
}

// Common units are SHARED across all programs — seeded ONCE as program-agnostic
// rows (program_id = NULL, is_common = true), not duplicated per program. These
// names (incl. spelling variants) are skipped in the per-program loop below.
const COMMON_UNIT_NAMES = new Set([
    'APPLY COMMUNICATION SKILLS',
    'APPLY DIGITAL LITERACY',
    'APPLY ENTREPRENEURIAL SKILLS',
    'APPLY WORK ETHICS AND PRACTICES',
    'APPLY WORK ETHICS PRACTICES',
    'APPLY WORKPLACE ETHICS AND PRACTICES',
]);
const CANONICAL_COMMON_UNITS = [
    { code: 'CU-COM', name: 'APPLY COMMUNICATION SKILLS' },
    { code: 'CU-DIG', name: 'APPLY DIGITAL LITERACY' },
    { code: 'CU-ENT', name: 'APPLY ENTREPRENEURIAL SKILLS' },
    { code: 'CU-ETH', name: 'APPLY WORK ETHICS AND PRACTICES' },
];
const normUnitName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();

async function seedUnits(progByCode) {
    // Department-owned units: each level program gets modules 1..cap(level); the
    // highest-level program of a course gets ALL modules present in the doc.
    // Common units are excluded here and seeded once (shared) afterwards.
    const values = [];
    for (const course of COURSES) {
        const availableModules = Object.keys(course.modules).map(Number).sort((a, b) => a - b);
        const maxLevel = Math.max(...course.levels);
        for (const level of course.levels) {
            const code = `${course.codePrefix}${level}`;
            const program = progByCode[code];
            if (!program) continue;
            const cap = MAX_MODULE_BY_LEVEL[level] || 0;
            const isTopLevel = level === maxLevel;
            const modulesToSeed = availableModules.filter((m) => (isTopLevel ? true : m <= cap));
            for (const m of modulesToSeed) {
                const names = course.modules[m] || [];
                for (const name of names) {
                    if (COMMON_UNIT_NAMES.has(normUnitName(name))) continue; // shared, seeded below
                    // The unit code IS the course code (e.g. "GA4"). Units are
                    // identified by name + module — the module lives in its own
                    // column, not baked into the code. Codes repeat per program.
                    values.push({
                        program_id: program.id,
                        code,
                        name,
                        module: m,
                        year: m,
                        semester: 1,
                        is_common: false,
                    });
                }
            }
        }
    }
    // Chunk the bulk insert to stay well under Postgres' parameter limit.
    const CHUNK = 500;
    for (let i = 0; i < values.length; i += CHUNK) {
        await db.insert(units).values(values.slice(i, i + CHUNK));
    }

    // Seed the shared common units ONCE (program-agnostic, module-agnostic).
    await db.insert(units).values(CANONICAL_COMMON_UNITS.map((c) => ({
        program_id: null,
        code: c.code,
        name: c.name,
        module: null,
        year: 1,
        semester: 1,
        is_common: true,
    })));

    console.log(`  ✓ units: ${values.length} department + ${CANONICAL_COMMON_UNITS.length} shared common`);
}

async function seedUsers() {
    // CRITICAL users — preserved emails. Passwords are defaults (V1 hashes not reachable).
    const adminPw = await hash('Admin@2026');
    const trainerPw = await hash('Trainer@2026');
    const demoPw = await hash('Mt5@2026');

    const items = [
        { email: 'okmomanyi56@gmail.com',           role: 'admin',     staff_id: 'ADMIN001',     name: 'System Administrator', department: 'Administration', password: adminPw },
        { email: 'calvinnate6@gmail.com',           role: 'registrar', staff_id: 'REGISTRAR001', name: 'Registrar',            department: 'Registry',       password: adminPw },
        { email: 'whitenat16@gmail.com',            role: 'trainer',   staff_id: null,           name: 'Madam Nelly Chepkwony', department: 'applied_science', password: trainerPw },
        { email: 'nashonbett18@gmail.com',          role: 'admin',     staff_id: 'ADMIN002',     name: 'Demo Presenter (Admin)',    department: 'Administration', password: demoPw },
        { email: 'nashonbett18+registrar@gmail.com', role: 'registrar', staff_id: 'REGISTRAR002', name: 'Demo Presenter (Registrar)', department: 'Registry',       password: demoPw },
        { email: 'maxxciey7@gmail.com',             role: 'admin',     staff_id: 'ADMIN003',     name: 'Maxxy', department: 'Administration', password: adminPw },
        { email: 'maxxymaxxy04@gmail.com',          role: 'registrar', staff_id: 'REGISTRAR003', name: 'Maxxy', department: 'Registry',       password: adminPw },
        { email: 'okmomanyi56+finance@gmail.com',   role: 'finance',   staff_id: 'FINANCE001',   name: 'Finance Officer',    department: 'Finance',            password: adminPw },
        { email: 'okmomanyi56+dean@gmail.com',      role: 'dean',      staff_id: 'DEAN001',      name: 'Dean of Students',   department: 'Academic Affairs',   password: adminPw },
        { email: 'okmomanyi56+deputy@gmail.com',    role: 'deputy',    staff_id: 'DEPUTY001',    name: 'Deputy Principal',   department: 'Administration',     password: adminPw },
        { email: 'okmomanyi56+ilo@gmail.com',       role: 'ilo',       staff_id: 'ILO001',       name: 'ILO Officer',        department: 'Industrial Liaison', password: adminPw },
        { email: 'okmomanyi56+cibec@gmail.com',     role: 'cibec',     staff_id: 'CIBEC001',     name: 'CIBEC Officer',      department: 'CIBEC',              password: adminPw },
        { email: 'maxxciey302+finance@gmail.com',   role: 'finance',   staff_id: 'FINANCE002',   name: 'Finance Officer',    department: 'Finance',            password: adminPw },
        { email: 'maxxciey302+dean@gmail.com',      role: 'dean',      staff_id: 'DEAN002',      name: 'Dean of Students',   department: 'Academic Affairs',   password: adminPw },
        { email: 'maxxciey302+deputy@gmail.com',    role: 'deputy',    staff_id: 'DEPUTY002',    name: 'Deputy Principal',   department: 'Administration',     password: adminPw },
        { email: 'maxxciey302+ilo@gmail.com',       role: 'ilo',       staff_id: 'ILO002',       name: 'ILO Officer',        department: 'Industrial Liaison', password: adminPw },
        { email: 'maxxciey302+cibec@gmail.com',     role: 'cibec',     staff_id: 'CIBEC002',     name: 'CIBEC Officer',      department: 'CIBEC',              password: adminPw },

        // Additional trainers across departments
        { email: 'james.kiprop@edtti.ac.ke',  role: 'trainer', name: 'James Kiprop',  department: 'electromechanical', password: trainerPw },
        { email: 'mary.atieno@edtti.ac.ke',   role: 'trainer', name: 'Mary Atieno',   department: 'business_liberal',  password: trainerPw },
        { email: 'peter.kamau@edtti.ac.ke',   role: 'trainer', name: 'Peter Kamau',   department: 'computing_informatics', password: trainerPw },
        { email: 'grace.wanjiru@edtti.ac.ke', role: 'trainer', name: 'Grace Wanjiru', department: 'hospitality',       password: trainerPw },
        { email: 'samuel.kiptoo@edtti.ac.ke', role: 'trainer', name: 'Samuel Kiptoo', department: 'agriculture',       password: trainerPw },
    ];

    const out = {};
    for (const u of items) {
        const row = await upsert(users, eq(users.email, u.email), {
            email: u.email,
            role: u.role,
            staff_id: u.staff_id || null,
            name: u.name,
            password: u.password,
            department: u.department,
            is_active: true,
            is_first_login: false,
            must_update_email: false,
            must_update_password: false,
            email_verified: true,
        });
        out[u.email] = row;
    }
    console.log(`  ✓ users: ${items.length} (${items.filter(i => i.role === 'admin').length} admin, ${items.filter(i => i.role === 'registrar').length} registrar, ${items.filter(i => i.role === 'trainer').length} trainer)`);
    return out;
}

async function seedStudents() {
    // Test "replica" students re-pointed onto the new catalog. `course` holds the
    // program CODE (e.g. GA5); `department` holds the snake_case department key.
    async function s(opts) {
        return {
            ...opts,
            password: await hash(opts.phone_number),
            role: 'student',
            is_active: true,
            status: 'active',
        };
    }
    const items = [
        await s({ admission_number: 'AC6/0001/S25',  name: 'Severina Chepkoech', phone_number: '0712345689', course: 'AC6',  department: 'applied_science',       module: 3, intake: 'september', intake_year: 2025, email: 'severina@example.com', admission_type: 'KUCCPS' }),
        await s({ admission_number: 'GA5/0001/J26',  name: 'Michael Olunga',     phone_number: '0712456783', course: 'GA5',  department: 'agriculture',           module: 2, intake: 'january',   intake_year: 2026, email: 'michael@example.com', admission_type: 'self-sponsored' }),
        await s({ admission_number: 'EE6/0001/S25',  name: 'Janet Mwende',       phone_number: '0723456781', course: 'EE6',  department: 'electromechanical',     module: 2, intake: 'september', intake_year: 2025, email: null, admission_type: 'KUCCPS' }),
        await s({ admission_number: 'ICT5/0001/J26', name: 'Daniel Mwangi',      phone_number: '0712111222', course: 'ICT5', department: 'computing_informatics', module: 1, intake: 'january',   intake_year: 2026, email: 'daniel@example.com', admission_type: 'self-sponsored' }),
        await s({ admission_number: 'BT5/0001/S25',  name: 'Ruth Akinyi',        phone_number: '0712333444', course: 'BT5',  department: 'building_civil',        module: 2, intake: 'september', intake_year: 2025, email: null, admission_type: 'KUCCPS' }),
        await s({ admission_number: 'FB5/0001/S25',  name: 'Brian Otieno',       phone_number: '0712555666', course: 'FB5',  department: 'hospitality',           module: 2, intake: 'september', intake_year: 2025, email: 'brian@example.com', admission_type: 'self-sponsored' }),
        await s({ admission_number: 'BM5/0001/J26',  name: 'Faith Njeri',        phone_number: '0712777888', course: 'BM5',  department: 'business_liberal',      module: 1, intake: 'january',   intake_year: 2026, email: null, admission_type: 'KUCCPS' }),
    ];
    const out = {};
    for (const it of items) {
        const row = await upsert(students, eq(students.admission_number, it.admission_number), it);
        out[it.admission_number] = row;
    }
    console.log(`  ✓ students: ${items.length}`);
    return out;
}

async function seedPayments(studentByAdmission, userByEmail) {
    const recorder = userByEmail['okmomanyi56@gmail.com'];
    const items = [
        { adm: 'AC6/0001/S25',  amount: '1200000.00', mode: 'bursary', bank: null, ref: 'HEF-001' },
        { adm: 'AC6/0001/S25',  amount: '70000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-987' },
        { adm: 'GA5/0001/J26',  amount: '30000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-100' },
        { adm: 'EE6/0001/S25',  amount: '45000.00',   mode: 'bank',    bank: 'Equity', ref: 'EQB-100' },
        { adm: 'ICT5/0001/J26', amount: '15000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-200' },
        { adm: 'BT5/0001/S25',  amount: '50000.00',   mode: 'bank',    bank: 'KCB', ref: 'KCB-100' },
        { adm: 'FB5/0001/S25',  amount: '25000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-300' },
        { adm: 'BM5/0001/J26',  amount: '20000.00',   mode: 'bursary', bank: null, ref: 'HEF-002' },
    ];
    let count = 0;
    for (const p of items) {
        const student = studentByAdmission[p.adm];
        if (!student) continue;
        // Idempotency key: student + reference_number is unique enough for seed.
        const existing = await db.select().from(payments)
            .where(eq(payments.reference_number, p.ref))
            .limit(1);
        if (existing.length) continue;
        await db.insert(payments).values({
            student_id: student.id,
            amount: p.amount,
            payment_mode: p.mode,
            bank_name: p.bank,
            reference_number: p.ref,
            recorded_by: recorder ? recorder.id : null,
        });
        count++;
    }
    console.log(`  ✓ payments (TEMPORARY): ${count} new (skipped existing)`);
}

async function seedPayslips(userByEmail) {
    const items = [
        { email: 'whitenat16@gmail.com',      month: '03', year: 2026, amount: '45000.00', gross: '50000.00', net: '45000.00', paye: '3000.00', nhif: '1500.00', nssf: '500.00' },
        { email: 'james.kiprop@edtti.ac.ke',  month: '03', year: 2026, amount: '42000.00', gross: '48000.00', net: '42000.00', paye: '4000.00', nhif: '1500.00', nssf: '500.00' },
        { email: 'mary.atieno@edtti.ac.ke',   month: '03', year: 2026, amount: '40000.00', gross: '45000.00', net: '40000.00', paye: '3000.00', nhif: '1500.00', nssf: '500.00' },
        { email: 'peter.kamau@edtti.ac.ke',   month: '04', year: 2026, amount: '43000.00', gross: '49000.00', net: '43000.00', paye: '4000.00', nhif: '1500.00', nssf: '500.00' },
        { email: 'grace.wanjiru@edtti.ac.ke', month: '04', year: 2026, amount: '41000.00', gross: '46500.00', net: '41000.00', paye: '3500.00', nhif: '1500.00', nssf: '500.00' },
    ];
    let count = 0;
    for (const p of items) {
        const trainer = userByEmail[p.email];
        if (!trainer) continue;
        // Idempotency key: trainer + month + year is unique enough for seed.
        const existing = await db.select().from(payslips)
            .where(eq(payslips.trainer_id, trainer.id))
            .limit(50);
        if (existing.some(x => x.month === p.month && x.year === p.year)) continue;
        await db.insert(payslips).values({
            trainer_id: trainer.id,
            month: p.month,
            year: p.year,
            amount: p.amount,
            gross_pay: p.gross,
            net_pay: p.net,
            paye: p.paye,
            nhif: p.nhif,
            nssf: p.nssf,
        });
        count++;
    }
    console.log(`  ✓ payslips (TEMPORARY): ${count} new (skipped existing)`);
}

async function seedHODs() {
    const hodPw = await hash('HOD@2026');
    const items = [
        { email: 'okmomanyi@gmail.com',                department: 'computing_informatics', name: 'HOD Computing & Informatics' },
        { email: 'hod.applied_science@edtti.ac.ke',    department: 'applied_science',       name: 'HOD Applied Science' },
        { email: 'hod.agriculture@edtti.ac.ke',        department: 'agriculture',           name: 'HOD Agriculture' },
        { email: 'hod.building_civil@edtti.ac.ke',     department: 'building_civil',        name: 'HOD Building & Civil' },
        { email: 'hod.electromechanical@edtti.ac.ke',  department: 'electromechanical',     name: 'HOD Electromechanical' },
        { email: 'hod.hospitality@edtti.ac.ke',        department: 'hospitality',           name: 'HOD Hospitality' },
        { email: 'hod.business_liberal@edtti.ac.ke',   department: 'business_liberal',      name: 'HOD Business & Liberal Studies' },
    ];
    let count = 0;
    for (const h of items) {
        await upsert(users, eq(users.email, h.email), {
            email: h.email,
            role: 'hod',
            staff_id: null,
            name: h.name,
            password: hodPw,
            department: h.department,
            is_active: true,
            is_first_login: false,
            must_update_email: false,
            must_update_password: false,
            email_verified: true,
        });
        count++;
    }
    console.log(`  ✓ hods: ${items.length} (${count} ensured)`);
}

async function main() {
    console.log('🌱 Seeding V2 database...');
    await resetCatalog();
    const dept = await seedDepartments();
    const prog = await seedPrograms(dept);
    await seedUnits(prog);
    const userByEmail = await seedUsers();
    await seedHODs();
    const studentByAdmission = await seedStudents();
    await seedPayments(studentByAdmission, userByEmail);
    await seedPayslips(userByEmail);
    console.log('✅ Seed complete.');
    await client.end({ timeout: 5 });
}

main().catch(async (err) => {
    console.error('❌ Seed failed:', err);
    try { await client.end({ timeout: 5 }); } catch (_) { /* */ }
    process.exit(1);
});
