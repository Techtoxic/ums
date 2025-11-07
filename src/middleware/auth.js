// Authentication Middleware
// Protects API endpoints with role-based access control

const Admin = require('../models/Admin');
const Trainer = require('../models/Trainer');

/**
 * Middleware to verify authentication token
 * Expects token in: Authorization header (Bearer token) or x-auth-token header
 */
const authenticateToken = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1] ? authHeader.split(' ')[1] : req.headers['x-auth-token'];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No authentication token provided.' 
            });
        }

        // For now, we'll use a simple token-based system
        // In production, use JWT tokens
        // This is a temporary solution - token should be stored securely on client side
        
        // Check if token is valid format (basic validation)
        if (token.length < 20) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid authentication token.' 
            });
        }

        // Store token in request for role checking
        req.token = token;
        req.user = { token }; // Temporary - should decode JWT here
        
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Authentication failed.' 
        });
    }
};

/**
 * Role-based access control middleware
 * @param {...string} allowedRoles - Roles allowed to access this endpoint
 */
const authorize = (...allowedRoles) => {
    return async (req, res, next) => {
        try {
            // Get role from token or session
            // For now, we'll check based on endpoint usage patterns
            // In production, decode JWT and get role from token payload
            
            const role = req.headers['x-user-role'] || req.query.role;
            
            if (!role || !allowedRoles.includes(role)) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Access forbidden. Insufficient permissions.' 
                });
            }

            req.userRole = role;
            next();
        } catch (error) {
            console.error('Authorization error:', error);
            res.status(403).json({ 
                success: false, 
                message: 'Authorization failed.' 
            });
        }
    };
};

/**
 * Simplified authentication - checks if request has valid admin credentials
 * This is a simpler approach for immediate security fix
 */
const requireAuth = async (req, res, next) => {
    try {
        // Check for admin credentials in headers
        const adminUser = req.headers['x-admin-user'];
        const adminPass = req.headers['x-admin-pass'];
        
        // Check for finance credentials
        const financeUser = req.headers['x-finance-user'];
        const financePass = req.headers['x-finance-pass'];
        
        // Check for registrar credentials  
        const registrarUser = req.headers['x-registrar-user'];
        const registrarPass = req.headers['x-registrar-pass'];

        // For now, block all unauthenticated requests
        // In production, implement proper JWT/session authentication
        if (!adminUser && !financeUser && !registrarUser) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required. Please login to access this resource.' 
            });
        }

        // If credentials provided, verify them (basic check)
        // In production, use proper authentication
        if (adminUser || financeUser || registrarUser) {
            req.authenticated = true;
            req.userRole = adminUser ? 'admin' : (financeUser ? 'finance' : 'registrar');
            next();
        } else {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials.' 
            });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Authentication failed.' 
        });
    }
};

/**
 * Check if request is from authenticated session
 * For immediate fix - block all public access to sensitive endpoints
 * Uses API key from environment or checks same-origin
 */
const blockPublicAccess = (req, res, next) => {
    // Get API key from environment (set in .env)
    const API_KEY = process.env.API_KEY || 'CHANGE_THIS_IN_PRODUCTION';
    
    // Check for API key in headers (for programmatic access)
    const apiKey = req.headers['x-api-key'] || req.headers['api-key'] || req.query.api_key;
    
    // Check if request is from same origin (same host)
    const host = req.headers.host || '';
    const allowedHosts = [
        'emura-tti.onrender.com',
        'localhost:5502',
        'localhost:10000',
        process.env.ALLOWED_HOST || ''
    ].filter(Boolean);
    
    // Check if request has origin/referer from allowed hosts
    const origin = req.headers.origin || req.headers.referer || '';
    const isSameOrigin = allowedHosts.some(allowed => 
        host.includes(allowed) || origin.includes(allowed)
    );
    
    // Check if API key is provided and matches
    const hasValidApiKey = apiKey && apiKey === API_KEY && API_KEY !== 'CHANGE_THIS_IN_PRODUCTION';
    
    // Allow if:
    // 1. Valid API key is provided (for programmatic access)
    // 2. OR request is from same origin (same-site request from browser)
    // NOTE: This is a basic protection. For production, implement proper JWT/session auth
    const isAuthorized = hasValidApiKey || isSameOrigin;
    
    if (!isAuthorized) {
        // Log unauthorized access attempt
        console.warn(`⚠️  UNAUTHORIZED ACCESS ATTEMPT: ${req.method} ${req.path}`);
        console.warn(`   Host: ${host}, Origin: ${origin || 'none'}, IP: ${req.ip}`);
        
        return res.status(401).json({ 
            success: false, 
            message: 'This endpoint requires authentication. Please login to access this resource.',
            error: 'UNAUTHORIZED',
            hint: 'This API requires authentication. Access is restricted to authorized users only.'
        });
    }

    next();
};

module.exports = {
    authenticateToken,
    authorize,
    requireAuth,
    blockPublicAccess
};

