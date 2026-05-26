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

// Generate intake code based on intake and year
function generateIntakeCode(intake, intakeYear) {
    const yearSuffix = intakeYear.toString().slice(-2); // Get last 2 digits of year
    const intakePrefix = intake === 'january' ? 'J' : 'S';
    return `${intakePrefix}${yearSuffix}`;
}

// Eligibility rule (recovered from the V1 GraduationApplication/AttachmentApplication eligibility
// static dropped in the Postgres migration): a student may apply in the final year of
// their level — Year (level - 3). Level 4 → Year 1, Level 5 → Year 2, Level 6 → Year 3.
function isEligibleToApply(level, yearOfStudy) {
    return yearOfStudy === (level - 3);
}

module.exports = { generateStudentInitialPassword, generateIntakeCode, isEligibleToApply };
