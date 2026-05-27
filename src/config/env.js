/**
 * Centralized environment-variable validation for V2.
 * Required env vars are validated at server boot — refuses to start if missing/invalid.
 *
 * Uses Zod for type-safe runtime validation. Loaded once via require() in server.js
 * before any DB connection or route registration.
 */
require('dotenv').config();
const { z } = require('zod');

const EnvSchema = z.object({
    // ---------- Required ----------
    DATABASE_URL: z
        .string({ required_error: 'DATABASE_URL is required (Postgres connection string)' })
        .url('DATABASE_URL must be a valid URL')
        .refine((s) => s.startsWith('postgres://') || s.startsWith('postgresql://'), {
            message: 'DATABASE_URL must start with postgres:// or postgresql://',
        }),
    JWT_SECRET: z
        .string({ required_error: 'JWT_SECRET is required' })
        .min(32, 'JWT_SECRET must be at least 32 characters'),

    // ---------- Optional with defaults ----------
    JWT_EXPIRES_IN: z.string().default('2h'),
    SESSION_SECRET: z.string().min(32).optional(),
    PORT: z.coerce.number().int().positive().default(5502),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    ALLOWED_ORIGINS: z.string().optional().default(''),
    COOKIE_SECURE: z.string().optional().default('false'),

    // ---------- Email (Brevo HTTP API) — optional in dev ----------
    BREVO_API_KEY: z.string().optional(),
    BREVO_SENDER_EMAIL: z.string().email().optional(),
    BREVO_SENDER_NAME: z.string().optional(),

    // ---------- Initial seed credentials (optional, used only by seed script) ----------
    INITIAL_ADMIN_PASSWORD: z.string().optional(),

    // ---------- AWS S3 (optional in dev) ----------
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_S3_BUCKET_NAME: z.string().optional(),
    AWS_REGION: z.string().optional().default('us-east-1'),
});

let validated;
try {
    validated = EnvSchema.parse(process.env);
} catch (err) {
    // Pretty-print Zod errors and exit non-zero.
    if (err && err.issues) {
        console.error('Invalid environment configuration:');
        for (const issue of err.issues) {
            console.error(`   - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
        }
    } else {
        console.error('Environment validation failed:', err && err.message);
    }
    process.exit(1);
}

module.exports = validated;
