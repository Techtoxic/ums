const { db, schema } = require('../db');
const { inArray } = require('drizzle-orm');

// Resolve the current academic period (integer year + semester) from
// system_settings. The value column is jsonb, so values come back already
// parsed (usually JS strings like "2024/2025" / "1"); read defensively in case
// a value is stored as JSON-encoded text. CONVENTION: academic_year uses the
// START year of the "YYYY/YYYY" range (2024/2025 → 2024) — both
// trainer_assignments and unit_registrations follow this so the /students join
// agrees. Missing settings fall back to (2024, 1) with a warning rather than
// crashing.
async function resolveAcademicPeriod() {
    const unwrap = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') {
            const s = v.trim();
            if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
                try { return String(JSON.parse(s)); } catch { return s.slice(1, -1); }
            }
            return s;
        }
        return String(v);
    };

    const rows = await db
        .select({ key: schema.systemSettings.key, value: schema.systemSettings.value })
        .from(schema.systemSettings)
        .where(inArray(schema.systemSettings.key, ['current_academic_year', 'current_semester']));

    const map = {};
    for (const r of rows) map[r.key] = unwrap(r.value);

    let academicYear = parseInt(String(map.current_academic_year || '').split('/')[0], 10);
    if (!Number.isInteger(academicYear)) {
        console.warn('current_academic_year setting missing/unparseable — defaulting to 2024');
        academicYear = 2024;
    }
    let semester = parseInt(map.current_semester, 10);
    if (!Number.isInteger(semester)) {
        console.warn('current_semester setting missing/unparseable — defaulting to 1');
        semester = 1;
    }
    return { academicYear, semester };
}

module.exports = { resolveAcademicPeriod };
