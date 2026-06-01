/**
 * EDTTI UMS — canonical list of COMMON units.
 *
 * A "common" unit can be allocated by ANY head of department to ANY trainer
 * (cross-department). Every other unit is department-owned and may only be
 * allocated by the HOD in charge of that department, to a trainer in that
 * department (enforced in src/routes/assignments.js).
 *
 * Units are matched by NAME (case-insensitive, whitespace-normalised) because
 * the same conceptual common unit appears under many per-program codes in the
 * catalog. Add every spelling variant that appears in drizzle/catalogData.js.
 *
 * This list is NOT PII (it comes from the public course catalog) so it is safe
 * to commit. Run `node drizzle/markCommonUnits.js` after editing it.
 *
 * NOTE: this is the standard Kenyan CBET common-unit set as a starting point.
 * Replace/extend it with the exact list you want.
 */
// The four common units chosen by the institution:
//   1. Communication Skills   2. Entrepreneurship
//   3. Workplace Ethics       4. Digital Literacy
// Listed with every spelling variant that appears in drizzle/catalogData.js.
module.exports = [
    // 1. Communication Skills
    'APPLY COMMUNICATION SKILLS',
    // 2. Entrepreneurship
    'APPLY ENTREPRENEURIAL SKILLS',
    // 3. Workplace Ethics
    'APPLY WORK ETHICS AND PRACTICES',
    'APPLY WORK ETHICS PRACTICES',
    'APPLY WORKPLACE ETHICS AND PRACTICES',
    // 4. Digital Literacy
    'APPLY DIGITAL LITERACY',
];
