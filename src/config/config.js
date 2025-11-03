// Configuration Module
// Centralized configuration for the application

// Load environment variables
require('dotenv').config();

const config = {
    // Server Configuration
    port: process.env.PORT || 5502,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Database Configuration
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/university_management',
    
    // API Configuration
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5502/api',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5502',
    
    // JWT Configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    },
    
    // File Upload Configuration
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
        uploadDir: process.env.UPLOAD_DIR || './uploads'
    },
    
    // Session Configuration
    session: {
        secret: process.env.SESSION_SECRET || 'dev-session-secret'
    },
    
    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    },
    
    // Monitoring
    logging: {
        enabled: process.env.ENABLE_LOGGING === 'true',
        level: process.env.LOG_LEVEL || 'info'
    },
    
    // AWS S3 Configuration (optional)
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        s3Bucket: process.env.AWS_S3_BUCKET
    },
    
    // Email Configuration (optional)
    email: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    
    // Feature Flags
    features: {
        enableEmailNotifications: process.env.ENABLE_EMAIL === 'true',
        enableS3Upload: process.env.ENABLE_S3 === 'true',
        enableRedisCache: process.env.ENABLE_REDIS === 'true'
    }
};

// Validation function
function validateConfig() {
    const requiredVars = ['mongodbUri'];
    const missing = requiredVars.filter(key => !config[key]);
    
    if (missing.length > 0) {
        console.warn(`⚠️  Warning: Missing configuration for: ${missing.join(', ')}`);
    }
    
    if (config.nodeEnv === 'production') {
        const productionRequired = ['jwt.secret', 'session.secret'];
        const missingProd = productionRequired.filter(key => {
            const keys = key.split('.');
            let value = config;
            for (const k of keys) {
                value = value[k];
            }
            return !value || value.includes('dev-');
        });
        
        if (missingProd.length > 0) {
            console.error(`❌ Error: Production requires: ${missingProd.join(', ')}`);
            process.exit(1);
        }
    }
}

// Run validation
validateConfig();

// Log configuration (hide sensitive data)
console.log('📝 Configuration loaded:');
console.log(`   Environment: ${config.nodeEnv}`);
console.log(`   Port: ${config.port}`);
console.log(`   API Base URL: ${config.apiBaseUrl}`);
console.log(`   Database: ${config.mongodbUri.replace(/\/\/.*@/, '//***@')}`);

module.exports = config;

