const crypto = require('crypto');

// SEV-H-014: generate a strong random initial password (>=12 chars, with
// lowercase, uppercase, digit and symbol). Uses crypto, not Math.random.
function generateStudentInitialPassword() {
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '@$!%*?&#';
    const all = lower + upper + digits + symbols;
    const pick = (set) => set[crypto.randomInt(0, set.length)];
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    while (chars.length < 14) chars.push(pick(all));
    // Fisher-Yates shuffle so the required classes are not always in front.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

// Generate intake code based on intake and year.
// january -> 'J', may -> 'M', september -> 'S'.
function generateIntakeCode(intake, intakeYear) {
    const yearSuffix = intakeYear.toString().slice(-2);
    let intakePrefix;
    switch ((intake || '').toLowerCase()) {
        case 'january':   intakePrefix = 'J'; break;
        case 'may':       intakePrefix = 'M'; break;
        case 'september': intakePrefix = 'S'; break;
        default:          intakePrefix = 'S';
    }
    return `${intakePrefix}${yearSuffix}`;
}

// Eligibility rule (recovered from the V1 GraduationApplication/AttachmentApplication eligibility
// static dropped in the Postgres migration): a student may apply in the final module of
// their level — Module (level - 3). Level 4 → Module 1, Level 5 → Module 2, Level 6 → Module 3.
function isEligibleToApply(level, moduleOfStudy) {
    return moduleOfStudy === (level - 3);
}

// Max modules per level — used by promotion logic on both backend + frontend.
const MAX_MODULE_BY_LEVEL = Object.freeze({
    3: 1,
    4: 2,
    5: 4,
    6: 6,
});

function getMaxModuleForLevel(level) {
    const n = Number(level);
    if (!MAX_MODULE_BY_LEVEL[n]) return null;
    return MAX_MODULE_BY_LEVEL[n];
}

// Pull the level (3-6) from a course code like `electrical_engineering_4`.
// Returns null when nothing parses.
function extractLevelFromCourse(course) {
    if (!course) return null;
    const m = String(course).match(/_(\d+)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
}

// Decide whether a student is eligible to be promoted. We accept either an
// already-resolved level number, or pull it from the student's course code.
function canPromoteStudent(student) {
    const currentModule = Number(student.module || 0);
    if (!Number.isFinite(currentModule) || currentModule < 1) return false;
    const level = extractLevelFromCourse(student.course);
    const cap = getMaxModuleForLevel(level);
    if (!cap) return false;
    return currentModule < cap;
}

// ---------------------------------------------------------------------------
// Grade validation
//
// Full grade list (in dropdown order): E, KCPE, D-, D, D+, C-, C, C+, B-, B, B+
//
// Course-level acceptance rules:
//   - Level 3 (KCPE-only): KCPE
//   - Level 4: E, D-
//   - Level 5: D, D+
//   - Level 6: C-, C, C+, B-, B, B+
// ---------------------------------------------------------------------------
const GRADE_DROPDOWN_ORDER = Object.freeze(['E', 'KCPE', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+']);

const ALLOWED_GRADES_BY_LEVEL = Object.freeze({
    3: ['KCPE'],
    4: ['E', 'D-'],
    5: ['D', 'D+'],
    6: ['C-', 'C', 'C+', 'B-', 'B', 'B+'],
});

function getAllowedGradesForLevel(level) {
    const list = ALLOWED_GRADES_BY_LEVEL[Number(level)];
    return list ? list.slice() : [];
}

function isGradeAllowedForLevel(grade, level) {
    if (!grade || !level) return false;
    const list = ALLOWED_GRADES_BY_LEVEL[Number(level)];
    if (!list) return false;
    return list.includes(String(grade).trim().toUpperCase().replace('KCPE', 'KCPE'));
}

module.exports = {
    generateStudentInitialPassword,
    generateIntakeCode,
    isEligibleToApply,
    MAX_MODULE_BY_LEVEL,
    getMaxModuleForLevel,
    extractLevelFromCourse,
    canPromoteStudent,
    GRADE_DROPDOWN_ORDER,
    ALLOWED_GRADES_BY_LEVEL,
    getAllowedGradesForLevel,
    isGradeAllowedForLevel,
};
