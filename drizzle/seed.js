/**
 * EDTTI UMS — V2 seed script.
 *
 * Idempotent: every insert checks for an existing record by a stable natural key
 * (email / code / admission_number) before inserting. Safe to re-run.
 *
 *   node drizzle/seed.js
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
    const items = [
        { name: 'Applied Science',     code: 'AS' },
        { name: 'Agriculture',         code: 'AG' },
        { name: 'Building & Civil',    code: 'BC' },
        { name: 'Electromechanical',   code: 'EM' },
        { name: 'Hospitality',         code: 'HO' },
        { name: 'Business & Liberal',  code: 'BL' },
        { name: 'ICT & Digital Media', code: 'IT' },
    ];
    const out = {};
    for (const it of items) {
        const row = await upsert(departments, eq(departments.code, it.code), it);
        out[it.code] = row;
    }
    console.log(`  ✓ departments: ${items.length}`);
    return out;
}

async function seedPrograms(deptByCode) {
    const items = [
        { code: 'AC6', name: 'Analytical Chemistry Level 6', level: 6, dept: 'AS' },
        { code: 'AP6', name: 'Applied Biology Level 6',      level: 6, dept: 'AS' },
        { code: 'EE6', name: 'Electrical Engineering Level 6', level: 6, dept: 'EM' },
        { code: 'AT5', name: 'Automotive Technology Level 5', level: 5, dept: 'EM' },
        { code: 'BT5', name: 'Building Technology Level 5',   level: 5, dept: 'BC' },
        { code: 'HM5', name: 'Hospitality Management Level 5', level: 5, dept: 'HO' },
        { code: 'FB4', name: 'Food & Beverage Level 4',       level: 4, dept: 'HO' },
        { code: 'IT5', name: 'ICT Level 5',                   level: 5, dept: 'IT' },
        { code: 'AG4', name: 'Agriculture Level 4',           level: 4, dept: 'AG' },
        { code: 'BM5', name: 'Business Management Level 5',   level: 5, dept: 'BL' },
        { code: 'AM5', name: 'Applied Mathematics Level 5',   level: 5, dept: 'AS' },
    ];
    const out = {};
    for (const it of items) {
        const row = await upsert(programs, eq(programs.code, it.code), {
            code: it.code,
            name: it.name,
            level: it.level,
            department_id: deptByCode[it.dept].id,
            program_cost: DEFAULT_PROGRAM_COST,
            duration_years: 3,
            is_active: true,
        });
        out[it.code] = row;
    }
    console.log(`  ✓ programs: ${items.length}`);
    return out;
}

async function seedUnits(progByCode) {
    // 3 units per program × representative 6 programs = 18 sample units.
    const sample = [
        { prog: 'AC6', code: 'AC6-101', name: 'General Chemistry I', year: 1, semester: 1 },
        { prog: 'AC6', code: 'AC6-102', name: 'Quantitative Analysis', year: 1, semester: 2 },
        { prog: 'AC6', code: 'AC6-201', name: 'Organic Chemistry',  year: 2, semester: 1 },
        { prog: 'EE6', code: 'EE6-101', name: 'Circuit Theory I',   year: 1, semester: 1 },
        { prog: 'EE6', code: 'EE6-102', name: 'Electronics I',      year: 1, semester: 2 },
        { prog: 'EE6', code: 'EE6-201', name: 'Power Systems',      year: 2, semester: 1 },
        { prog: 'IT5', code: 'IT5-101', name: 'Computer Networks',  year: 1, semester: 1 },
        { prog: 'IT5', code: 'IT5-102', name: 'Programming Fundamentals', year: 1, semester: 2 },
        { prog: 'IT5', code: 'IT5-201', name: 'Database Systems',   year: 2, semester: 1 },
        { prog: 'BT5', code: 'BT5-101', name: 'Construction Materials', year: 1, semester: 1 },
        { prog: 'BT5', code: 'BT5-102', name: 'Site Surveying',     year: 1, semester: 2 },
        { prog: 'HM5', code: 'HM5-101', name: 'Front Office Operations', year: 1, semester: 1 },
        { prog: 'HM5', code: 'HM5-102', name: 'Food Production I',  year: 1, semester: 2 },
        { prog: 'BM5', code: 'BM5-101', name: 'Principles of Management', year: 1, semester: 1 },
        { prog: 'BM5', code: 'BM5-102', name: 'Business Communication', year: 1, semester: 2 },
        { prog: 'AG4', code: 'AG4-101', name: 'Crop Production',    year: 1, semester: 1 },
        { prog: 'AM5', code: 'AM5-101', name: 'Calculus I',         year: 1, semester: 1 },
        { prog: 'AM5', code: 'AM5-102', name: 'Linear Algebra',     year: 1, semester: 2 },
    ];
    let count = 0;
    for (const u of sample) {
        const program = progByCode[u.prog];
        if (!program) continue;
        await upsert(units, eq(units.code, u.code), {
            program_id: program.id,
            code: u.code,
            name: u.name,
            year: u.year,
            semester: u.semester,
            is_common: false,
        });
        count++;
    }
    console.log(`  ✓ units: ${count}`);
}

async function seedCommonUnits(_progByCode) {
    // Common units sit alongside program-specific units in the `units` table
    // with program_id=NULL and is_common=true. The schema's program_id column
    // is nullable specifically for this case.
    const items = [
        { code: 'CU-001', name: 'Communication Skills' },
        { code: 'CU-002', name: 'Numeracy Skills' },
        { code: 'CU-003', name: 'Digital Literacy' },
        { code: 'CU-004', name: 'Entrepreneurial Skills' },
        { code: 'CU-005', name: 'Employability Skills' },
        { code: 'CU-006', name: 'Environmental Literacy' },
        { code: 'CU-007', name: 'Occupational Safety and Health (OSH) Practices' },
    ];
    let count = 0;
    for (const u of items) {
        await upsert(units, eq(units.code, u.code), {
            program_id: null,
            code: u.code,
            name: u.name,
            year: 1,
            semester: 1,
            is_common: true,
        });
        count++;
    }
    console.log(`  ✓ common units: ${items.length} (${count} ensured)`);
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
    // Each student's initial password = their phone number (hashed).
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
        await s({ admission_number: 'AC6/0001/S25', name: 'Severina Chepkoech', phone_number: '0712345689', course: 'AC6', department: 'applied_science',     year: 3, intake: 'september', intake_year: 2025, email: 'severina@example.com', admission_type: 'KUCCPS' }),
        await s({ admission_number: 'AM5/0001/J26', name: 'Michael Olunga',     phone_number: '0712456783', course: 'AM5', department: 'applied_science',     year: 2, intake: 'january',   intake_year: 2026, email: 'michael@example.com', admission_type: 'self-sponsored' }),
        await s({ admission_number: 'EE6/0001/S25', name: 'Janet Mwende',       phone_number: '0723456781', course: 'EE6', department: 'electromechanical',   year: 2, intake: 'september', intake_year: 2025, email: null, admission_type: 'KUCCPS' }),
        await s({ admission_number: 'IT5/0001/J26', name: 'Daniel Mwangi',      phone_number: '0712111222', course: 'IT5', department: 'computing_informatics', year: 1, intake: 'january',   intake_year: 2026, email: 'daniel@example.com', admission_type: 'self-sponsored' }),
        await s({ admission_number: 'BT5/0001/S25', name: 'Ruth Akinyi',        phone_number: '0712333444', course: 'BT5', department: 'building_civil',      year: 2, intake: 'september', intake_year: 2025, email: null, admission_type: 'KUCCPS' }),
        await s({ admission_number: 'HM5/0001/S25', name: 'Brian Otieno',       phone_number: '0712555666', course: 'HM5', department: 'hospitality',         year: 2, intake: 'september', intake_year: 2025, email: 'brian@example.com', admission_type: 'self-sponsored' }),
        await s({ admission_number: 'BM5/0001/J26', name: 'Faith Njeri',        phone_number: '0712777888', course: 'BM5', department: 'business_liberal',    year: 1, intake: 'january',   intake_year: 2026, email: null, admission_type: 'KUCCPS' }),
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
        { adm: 'AC6/0001/S25', amount: '1200000.00', mode: 'bursary', bank: null, ref: 'HEF-001' },
        { adm: 'AC6/0001/S25', amount: '70000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-987' },
        { adm: 'AM5/0001/J26', amount: '30000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-100' },
        { adm: 'EE6/0001/S25', amount: '45000.00',   mode: 'bank',    bank: 'Equity', ref: 'EQB-100' },
        { adm: 'IT5/0001/J26', amount: '15000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-200' },
        { adm: 'BT5/0001/S25', amount: '50000.00',   mode: 'bank',    bank: 'KCB', ref: 'KCB-100' },
        { adm: 'HM5/0001/S25', amount: '25000.00',   mode: 'mpesa',   bank: null, ref: 'MPE-300' },
        { adm: 'BM5/0001/J26', amount: '20000.00',   mode: 'bursary', bank: null, ref: 'HEF-002' },
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
    const dept = await seedDepartments();
    const prog = await seedPrograms(dept);
    await seedUnits(prog);
    await seedCommonUnits(prog);
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
