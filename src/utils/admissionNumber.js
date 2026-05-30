// Globally unique admission number allocator.
//
// Format restored on v2-test:  <COURSE_CODE>/<GLOBAL_SEQ>/<INTAKE_CODE>
//   e.g.  BM5/2503/J26
//
// - COURSE_CODE comes from the registrar courseConfig (mirrored in
//   src/utils/courseCodes.js).
// - GLOBAL_SEQ is a single global counter (admission_number_counter table,
//   seeded at 2500). Postgres makes the UPDATE … RETURNING atomic, so two
//   concurrent registrations can never collide.
// - INTAKE_CODE follows the original convention: J/M/S + 2-digit intake year
//   (january/may/september).
//
// The previous session broke this by storing only the raw global number; this
// module restores the original format while keeping the global-counter
// guarantee.
const { client } = require('../db');
const { generateIntakeCode } = require('./studentHelpers');
const { getCourseCode } = require('./courseCodes');

const COUNTER_ID = 1;

// Read-only peek at what the next allocation will be. Returns the raw global
// number (e.g. "2503"). Used internally; the format-aware peek below is what
// the registrar UI calls.
async function peekNextGlobalNumber() {
    const rows = await client`
        SELECT next_number FROM admission_number_counter WHERE id = ${COUNTER_ID}
    `;
    if (!rows.length) {
        throw new Error('admission_number_counter row missing (migration 0007 not applied?)');
    }
    return String(rows[0].next_number);
}

// Allocate the next global admission number atomically. Returns the raw
// number (e.g. "2503"). The composed admission number is built by the caller
// once it has the course code + intake.
async function allocateNextGlobalNumber() {
    const rows = await client`
        UPDATE admission_number_counter
           SET next_number = next_number + 1,
               updated_at = now()
         WHERE id = ${COUNTER_ID}
         RETURNING next_number - 1 AS allocated
    `;
    if (!rows.length) {
        throw new Error('admission_number_counter row missing (migration 0007 not applied?)');
    }
    return String(rows[0].allocated);
}

// Compose an admission number from the three parts.
function composeAdmissionNumber({ courseCode, globalNumber, intake, intakeYear }) {
    if (!courseCode) throw new Error('courseCode is required to compose an admission number');
    if (!globalNumber) throw new Error('globalNumber is required to compose an admission number');
    if (!intake) throw new Error('intake is required to compose an admission number');
    if (!intakeYear) throw new Error('intakeYear is required to compose an admission number');
    const intakeCode = generateIntakeCode(intake, intakeYear);
    return `${courseCode}/${globalNumber}/${intakeCode}`;
}

// Preview the next admission number that will be assigned for a given
// (course, intake, intakeYear) triple. Read-only; does NOT advance the
// counter. Returns the composed string e.g. "BM5/2503/J26".
async function peekNextAdmissionNumberFor(course, intake, intakeYear) {
    const courseCode = getCourseCode(course);
    if (!courseCode) {
        throw Object.assign(new Error(`Unknown course "${course}"; cannot compose admission number.`), { statusCode: 400 });
    }
    const globalNumber = await peekNextGlobalNumber();
    return composeAdmissionNumber({ courseCode, globalNumber, intake, intakeYear });
}

// Atomically allocate + compose. Returns the composed admission number; the
// global counter is advanced by one. Caller is responsible for inserting the
// student row; on failure the counter is intentionally NOT rolled back to
// avoid burning numbers across retries (matches the previous behaviour).
async function allocateAdmissionNumberFor(course, intake, intakeYear) {
    const courseCode = getCourseCode(course);
    if (!courseCode) {
        throw Object.assign(new Error(`Unknown course "${course}"; cannot compose admission number.`), { statusCode: 400 });
    }
    const globalNumber = await allocateNextGlobalNumber();
    return composeAdmissionNumber({ courseCode, globalNumber, intake, intakeYear });
}

module.exports = {
    peekNextGlobalNumber,
    allocateNextGlobalNumber,
    composeAdmissionNumber,
    peekNextAdmissionNumberFor,
    allocateAdmissionNumberFor,
    // Legacy exports kept for backward compatibility with any code still
    // requiring the un-composed allocator. New code should prefer the
    // *_For helpers above.
    peekNextAdmissionNumber: peekNextGlobalNumber,
    allocateNextAdmissionNumber: allocateNextGlobalNumber,
};
