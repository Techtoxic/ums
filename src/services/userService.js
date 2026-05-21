/**
 * EDTTI UMS — userService
 *
 * Pure Drizzle/Postgres operations on the unified `users` table (admin,
 * registrar, finance, dean, deputy, ilo, cibec, hod, trainer). No dependency
 * on src/db/models.js (the V1 facade). Returns raw rows with snake_case
 * column names; callers are responsible for shaping responses.
 */
const bcrypt = require('bcryptjs');
const { eq, and, isNull, sql, desc } = require('drizzle-orm');
const { db, schema } = require('../db');

const { users } = schema;
const BCRYPT_COST = 12;
const MAX_LOGIN_ATTEMPTS = 10;
const LOCK_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Find any (non-deleted) user by email (case-insensitive). */
async function findByEmail(email) {
    if (!email) return null;
    const lower = String(email).trim().toLowerCase();
    const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.email, lower), isNull(users.deleted_at)))
        .limit(1);
    return rows[0] || null;
}

/** Find a non-deleted user by email + role. */
async function findByEmailAndRole(email, role) {
    if (!email || !role) return null;
    const lower = String(email).trim().toLowerCase();
    const rows = await db
        .select()
        .from(users)
        .where(and(
            eq(users.email, lower),
            eq(users.role, role),
            isNull(users.deleted_at),
        ))
        .limit(1);
    return rows[0] || null;
}

/** Find a non-deleted user by UUID. */
async function findById(id) {
    if (!id) return null;
    const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deleted_at)))
        .limit(1);
    return rows[0] || null;
}

/**
 * Active, non-deleted user matching department + role (case-sensitive on both —
 * department codes are lowercase snake_case in the seed). Orders by created_at
 * desc and returns the most recent if multiple match.
 */
async function findActiveByDepartmentAndRole(department, role) {
    if (!department || !role) return null;
    const rows = await db
        .select()
        .from(schema.users)
        .where(and(
            eq(schema.users.department, department),
            eq(schema.users.role, role),
            eq(schema.users.is_active, true),
            isNull(schema.users.deleted_at),
        ))
        .orderBy(desc(schema.users.created_at))
        .limit(1);
    return rows[0] || null;
}

/** Same as findByEmail but only returns active users. */
async function findActiveByEmail(email) {
    if (!email) return null;
    const lower = String(email).trim().toLowerCase();
    const rows = await db
        .select()
        .from(users)
        .where(and(
            eq(users.email, lower),
            eq(users.is_active, true),
            isNull(users.deleted_at),
        ))
        .limit(1);
    return rows[0] || null;
}

/** Pure function: true if the user has a lock_until in the future. */
function isLocked(user) {
    if (!user || !user.lock_until) return false;
    const lockTime = user.lock_until instanceof Date
        ? user.lock_until.getTime()
        : new Date(user.lock_until).getTime();
    return Number.isFinite(lockTime) && lockTime > Date.now();
}

/**
 * Atomically increment login_attempts. If the new value would reach
 * MAX_LOGIN_ATTEMPTS, also set lock_until to NOW() + 2 hours. Single UPDATE
 * statement — the CASE references the pre-update value of login_attempts so
 * the threshold check is correct.
 */
async function incrementLoginAttempts(userId) {
    if (!userId) return null;
    const rows = await db
        .update(users)
        .set({
            login_attempts: sql`${users.login_attempts} + 1`,
            lock_until: sql`CASE
                WHEN ${users.login_attempts} + 1 >= ${MAX_LOGIN_ATTEMPTS}
                THEN NOW() + INTERVAL '${sql.raw(String(LOCK_DURATION_MS / 1000))} seconds'
                ELSE ${users.lock_until}
            END`,
            updated_at: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
    return rows[0] || null;
}

/** Clear failed-attempt state. */
async function resetLoginAttempts(userId) {
    if (!userId) return;
    await db
        .update(users)
        .set({
            login_attempts: 0,
            lock_until: null,
            updated_at: new Date(),
        })
        .where(eq(users.id, userId));
}

/** Stamp last_login = NOW(). */
async function updateLastLogin(userId) {
    if (!userId) return;
    const now = new Date();
    await db
        .update(users)
        .set({ last_login: now, updated_at: now })
        .where(eq(users.id, userId));
}

/** Async: bcrypt-compare a candidate password against the stored hash. */
async function comparePassword(user, candidatePassword) {
    if (!user || !user.password || !candidatePassword) return false;
    return bcrypt.compare(candidatePassword, user.password);
}

/** Mark first-login flow complete. */
async function completeFirstLogin(userId) {
    if (!userId) return;
    await db
        .update(users)
        .set({
            is_first_login: false,
            must_update_email: false,
            must_update_password: false,
            updated_at: new Date(),
        })
        .where(eq(users.id, userId));
}

/**
 * Update the user's email (lowercased). Clears must_update_email and
 * bumps token_version to invalidate any outstanding JWTs.
 */
async function updateEmail(userId, newEmail) {
    if (!userId || !newEmail) return null;
    const lower = String(newEmail).trim().toLowerCase();
    const rows = await db
        .update(users)
        .set({
            email: lower,
            must_update_email: false,
            token_version: sql`${users.token_version} + 1`,
            updated_at: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
    return rows[0] || null;
}

/**
 * Hash newPasswordPlain at bcrypt cost 12, store, clear must_update_password,
 * stamp last_password_change, bump token_version. Does not return the row.
 */
async function updatePassword(userId, newPasswordPlain) {
    if (!userId || !newPasswordPlain) return;
    const hash = await bcrypt.hash(newPasswordPlain, BCRYPT_COST);
    const now = new Date();
    await db
        .update(users)
        .set({
            password: hash,
            must_update_password: false,
            last_password_change: now,
            token_version: sql`${users.token_version} + 1`,
            updated_at: now,
        })
        .where(eq(users.id, userId));
}

/**
 * Atomically increment a user's token_version. Used on logout and on any
 * server-side session invalidation (password change, role change, etc.) so
 * that existing JWTs become unusable on next verifyToken pass. Pairs with the
 * SEV-H-013 check in middleware/auth.js.
 *
 * Only operates on rows in the `users` table — students live in a separate
 * table without a token_version column. Callers are responsible for checking
 * role before invoking.
 */
async function bumpTokenVersion(userId) {
    if (!userId) return;
    await db
        .update(users)
        .set({
            token_version: sql`${users.token_version} + 1`,
            updated_at: new Date(),
        })
        .where(eq(users.id, userId));
}

module.exports = {
    findByEmail,
    findByEmailAndRole,
    findById,
    findActiveByEmail,
    findActiveByDepartmentAndRole,
    isLocked,
    incrementLoginAttempts,
    resetLoginAttempts,
    updateLastLogin,
    comparePassword,
    completeFirstLogin,
    updateEmail,
    updatePassword,
    bumpTokenVersion,
};
