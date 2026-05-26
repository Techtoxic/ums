// SEV-H-019: escape user/DB-supplied values before using them inside a RegExp
// (or the shim's $regex translator), to prevent regex injection and ReDoS.
function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// V2: validate Postgres UUID v4/v5 ids before using them in WHERE clauses.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidId(id) {
    return typeof id === 'string' && UUID_RE.test(id);
}

module.exports = { escapeRegex, isValidId };
