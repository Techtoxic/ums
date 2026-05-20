/**
 * EDTTI UMS — otpService
 *
 * Pure Drizzle/Postgres OTP operations on the `login_otps` table. Replicates
 * V1's security properties:
 *   - OTPs are stored as SHA-256 hashes; the raw code never lives in the DB
 *   - 6-digit codes (000000–999999) generated via crypto.randomInt
 *   - 10-minute expiry
 *   - 5-attempt cap; the record is consumed once the cap is hit
 *   - Records link to user_id + user_role so OTPs are bound to one user
 *
 * Raw codes only exist briefly: the value returned by createOtp() is sent to
 * the user by email and never persisted. Verification re-hashes the supplied
 * code and compares hashes only.
 */
const crypto = require('crypto');
const { eq, and, isNull, gt, lt, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../db');

const { loginOtps } = schema;
const OTP_TTL_MS = 10 * 60 * 1000;     // 10 minutes
const MAX_ATTEMPTS = 5;
const CLEANUP_OLDER_THAN_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Pure sync: SHA-256 hex digest of the raw code (matches V1's hashOtpValue). */
function hashOtp(rawCode) {
    return crypto.createHash('sha256').update(String(rawCode)).digest('hex');
}

/** Pure sync: 6-digit zero-padded string from a CSPRNG. */
function generateOtp() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Generate a fresh OTP, store its hash, return the raw code to the caller.
 * The caller must email the raw code immediately and discard it. The DB only
 * ever sees the hash.
 */
async function createOtp({ userId, userRole, email }) {
    if (!email) throw new Error('createOtp: email is required');
    const rawCode = generateOtp();
    const codeHash = hashOtp(rawCode);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const rows = await db.insert(loginOtps).values({
        email: String(email).trim().toLowerCase(),
        user_id: userId || null,
        user_role: userRole || null,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
    }).returning({ id: loginOtps.id });
    return { rawCode, recordId: rows[0].id };
}

/**
 * Invalidate all currently-active OTPs for this user (used_at IS NULL AND
 * expires_at > NOW()). Returns count invalidated.
 */
async function invalidateUserOtps(userId, userRole) {
    if (!userId) return 0;
    const where = userRole
        ? and(eq(loginOtps.user_id, userId), eq(loginOtps.user_role, userRole), isNull(loginOtps.used_at), gt(loginOtps.expires_at, sql`NOW()`))
        : and(eq(loginOtps.user_id, userId), isNull(loginOtps.used_at), gt(loginOtps.expires_at, sql`NOW()`));
    const rows = await db.update(loginOtps).set({
        used_at: new Date(),
        updated_at: new Date(),
    }).where(where).returning({ id: loginOtps.id });
    return rows.length;
}

/**
 * Verify a candidate OTP against the most-recent active record for an email.
 * Atomic counter increment to guard against parallel guesses.
 *
 * Returns one of:
 *   { valid: true,  userId, userRole, otpId }
 *   { valid: false, reason: 'no_otp_found' }
 *   { valid: false, reason: 'expired' }
 *   { valid: false, reason: 'too_many_attempts' }
 *   { valid: false, reason: 'invalid_code', attemptsRemaining }
 */
async function verifyOtp({ email, code }) {
    if (!email || !code) return { valid: false, reason: 'no_otp_found' };
    const lowerEmail = String(email).trim().toLowerCase();
    const candidate = String(code).trim();

    // Most recent unused, unexpired record for this email.
    const rows = await db.select().from(loginOtps)
        .where(and(
            eq(loginOtps.email, lowerEmail),
            isNull(loginOtps.used_at),
            gt(loginOtps.expires_at, sql`NOW()`),
        ))
        .orderBy(desc(loginOtps.created_at))
        .limit(1);

    const record = rows[0];
    if (!record) return { valid: false, reason: 'no_otp_found' };

    // Atomically bump attempts counter — this is the source of truth even if
    // the in-memory `record.attempts` was stale.
    const updatedRows = await db.update(loginOtps).set({
        attempts: sql`${loginOtps.attempts} + 1`,
        updated_at: new Date(),
    }).where(eq(loginOtps.id, record.id)).returning({ attempts: loginOtps.attempts });
    const attemptsNow = updatedRows[0] ? updatedRows[0].attempts : record.attempts + 1;

    // Hit the cap? Burn the record so no further guesses can succeed.
    if (attemptsNow > MAX_ATTEMPTS) {
        await db.update(loginOtps).set({
            used_at: new Date(),
            updated_at: new Date(),
        }).where(eq(loginOtps.id, record.id));
        return { valid: false, reason: 'too_many_attempts' };
    }

    // Constant-time hash compare.
    const supplied = hashOtp(candidate);
    const stored = record.code_hash;
    const ok = supplied.length === stored.length &&
        crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(stored, 'hex'));

    if (!ok) {
        return {
            valid: false,
            reason: 'invalid_code',
            attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attemptsNow),
        };
    }

    // Success — consume the record so it can't be reused.
    await db.update(loginOtps).set({
        used_at: new Date(),
        updated_at: new Date(),
    }).where(eq(loginOtps.id, record.id));

    return {
        valid: true,
        userId: record.user_id,
        userRole: record.user_role,
        otpId: record.id,
    };
}

/** Optional housekeeping: delete OTP rows older than 24 hours. Not scheduled. */
async function cleanupExpiredOtps() {
    const cutoff = new Date(Date.now() - CLEANUP_OLDER_THAN_MS);
    const rows = await db.delete(loginOtps)
        .where(lt(loginOtps.expires_at, cutoff))
        .returning({ id: loginOtps.id });
    return rows.length;
}

module.exports = {
    hashOtp,
    generateOtp,
    createOtp,
    invalidateUserOtps,
    verifyOtp,
    cleanupExpiredOtps,
};
