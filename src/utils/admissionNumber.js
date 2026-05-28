// Globally unique admission number allocator.
//
// Backed by the single-row admission_number_counter table (id = 1). Postgres
// guarantees atomicity within a single UPDATE statement, so concurrent
// registrations never collide. New numbers start at 2500 (the table is seeded
// with next_number = 2500 by migration 0007).
const { client } = require('../db');

const COUNTER_ID = 1;

// Allocate the next admission number and return it as a string. Throws if the
// counter row was never seeded (which should never happen post-migration).
async function allocateNextAdmissionNumber() {
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

// Read-only peek at what the next allocation will be — used by the registrar
// frontend to show a preview before the form is submitted.
async function peekNextAdmissionNumber() {
    const rows = await client`
        SELECT next_number FROM admission_number_counter WHERE id = ${COUNTER_ID}
    `;
    if (!rows.length) {
        throw new Error('admission_number_counter row missing (migration 0007 not applied?)');
    }
    return String(rows[0].next_number);
}

module.exports = { allocateNextAdmissionNumber, peekNextAdmissionNumber };
