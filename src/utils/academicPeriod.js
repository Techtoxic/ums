const { db, schema } = require('../db');
const { inArray } = require('drizzle-orm');

// ---------------------------------------------------------------------------
// DYNAMIC ACADEMIC YEAR  (single source of truth, used across all portals)
//
// Rule: the academic year runs September → August. So any date in
// Sep..Dec belongs to YYYY/(YYYY+1); any date in Jan..Aug belongs to
// (YYYY-1)/YYYY. Example: 29 May 2026 → 2025/2026 (started Sep 2025).
//
// CONVENTION: the integer academic_year stored on trainer_assignments and
// unit_registrations is the START year of the range (2025/2026 → 2025).
// ---------------------------------------------------------------------------
function getCurrentAcademicYear(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date();
    const year = d.getFullYear();
    const month = d.getMonth(); // 0 = Jan ... 8 = Sep
    const startYear = month >= 8 ? year : year - 1; // September (index 8) starts the year
    return {
        startYear,
        endYear: startYear + 1,
        label: `${startYear}/${startYear + 1}`,       // "2025/2026"
        labelDash: `${startYear}-${startYear + 1}`,    // "2025-2026"
    };
}

function getCurrentAcademicYearStart(date) {
    return getCurrentAcademicYear(date).startYear;
}

function getCurrentAcademicYearLabel(date) {
    return getCurrentAcademicYear(date).label;
}

// Resolve the current academic period (integer year + semester) for use by
// trainer_assignments / unit_registrations. The academic year is computed
// DYNAMICALLY (September–August) and is no longer read from system_settings,
// so it always reflects the real calendar. The semester is still read from
// system_settings (current_semester) and defaults to 1.
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

    const academicYear = getCurrentAcademicYearStart();

    let semester = 1;
    try {
        const rows = await db
            .select({ key: schema.systemSettings.key, value: schema.systemSettings.value })
            .from(schema.systemSettings)
            .where(inArray(schema.systemSettings.key, ['current_semester']));
        const map = {};
        for (const r of rows) map[r.key] = unwrap(r.value);
        const parsed = parseInt(map.current_semester, 10);
        if (Number.isInteger(parsed)) semester = parsed;
    } catch (err) {
        console.warn('resolveAcademicPeriod: could not read current_semester, defaulting to 1:', err.message);
    }

    return { academicYear, semester };
}

module.exports = {
    resolveAcademicPeriod,
    getCurrentAcademicYear,
    getCurrentAcademicYearStart,
    getCurrentAcademicYearLabel,
};
