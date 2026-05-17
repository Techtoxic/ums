// Configuration Module
// Centralized configuration for the application.
// Hard-fails in production when critical secrets are missing or weak.

require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Helper to read a secret that must be strong in production
function readSecret(varName, devFallback) {
    const value = process.env[varName];
    if (value && value.length >= 32 && !/dev[-_]?secret|change[-_]?in[-_]?production|your[-_]?secret/i.test(value)) {
        return value;
    }
    if (isProduction) {
        // Refuse to boot - we will not let a weak secret silently start in prod
        console.error(`FATAL: ${varName} is not set or is too weak. Set a strong value (>= 32 chars) and restart.`);
        process.exit(1);
    }
    // Development only fallback. Logged loudly so it cannot be missed.
    console.warn(`WARNING: ${varName} not set or is weak. Using DEVELOPMENT fallback. DO NOT DEPLOY THIS WAY.`);
    return value || devFallback;
}

const config = {
    // Server Configuration
    port: process.env.PORT || 5502,
    nodeEnv,
    isProduction,

    // Database Configuration
    mongodbUri: process.env.MONGODB_URI || (isProduction ? null : 'mongodb://localhost:27017/university_management'),

    // API Configuration
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5502/api',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5502',
    baseUrl: process.env.BASE_URL || process.env.CLIENT_URL || 'http://localhost:5502',

    // JWT Configuration - secret is mandatory in production
    jwt: {
        secret: readSecret('JWT_SECRET', 'dev-only-not-for-production-' + Date.now()),
        expiresIn: process.env.JWT_EXPIRES_IN || '2h' // SEV-H-013: short window; refresh tokens are a Stage 3 item
    },

    // Session Configuration
    session: {
        secret: readSecret('SESSION_SECRET', 'dev-only-session-' + Date.now())
    },

    // CORS - explicit allowed origins (comma separated in env)
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),

    // Initial admin password (used only on first seed)
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || null,

    // File Upload Configuration
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
        uploadDir: process.env.UPLOAD_DIR || './uploads'
    },

    // Rate Limiting (per IP)
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    },

    // AWS S3 Configuration (optional)
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        s3Bucket: process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME
    }
};

// Validation
if (!config.mongodbUri) {
    console.error('FATAL: MONGODB_URI is required in production.');
    process.exit(1);
}

if (isProduction && config.allowedOrigins.length === 0) {
    console.warn('WARNING: ALLOWED_ORIGINS not set in production. CORS will reject all cross-origin requests.');
}

console.log('Configuration loaded:');
console.log(`  Environment: ${config.nodeEnv}`);
console.log(`  Port: ${config.port}`);
console.log(`  Database: ${config.mongodbUri.replace(/\/\/[^@]+@/, '//***:***@')}`);
console.log(`  Allowed origins: ${config.allowedOrigins.length ? config.allowedOrigins.join(', ') : '(any in dev)'}`);

module.exports = config;
