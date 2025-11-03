// Frontend Configuration
// This file provides API configuration for all frontend JavaScript files

(function(window) {
    'use strict';
    
    // Detect environment
    const hostname = window.location.hostname;
    const isProduction = hostname !== 'localhost' && hostname !== '127.0.0.1';
    
    // Configuration object
    const config = {
        // API Base URL - Always use same host
        API_BASE_URL: `${window.location.protocol}//${window.location.host}/api`,
        
        // Environment
        ENV: isProduction ? 'production' : 'development',
        
        // File upload limits
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
        ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
        
        // Pagination
        DEFAULT_PAGE_SIZE: 10,
        MAX_PAGE_SIZE: 100,
        
        // Timeouts
        REQUEST_TIMEOUT: 30000, // 30 seconds
        
        // Cache duration (milliseconds)
        CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
        
        // Feature flags
        FEATURES: {
            ENABLE_ANALYTICS: isProduction,
            ENABLE_ERROR_REPORTING: isProduction,
            DEBUG_MODE: !isProduction
        }
    };
    
    // Helper function to build API URL
    config.buildApiUrl = function(endpoint) {
        // Remove leading slash if present
        endpoint = endpoint.replace(/^\//, '');
        return `${this.API_BASE_URL}/${endpoint}`;
    };
    
    // Helper function for fetch with timeout
    config.fetchWithTimeout = function(url, options = {}) {
        const timeout = options.timeout || this.REQUEST_TIMEOUT;
        
        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]);
    };
    
    // Log configuration in development
    if (config.FEATURES.DEBUG_MODE) {
        console.log('🔧 Frontend Config:', {
            API_BASE_URL: config.API_BASE_URL,
            ENV: config.ENV,
            hostname: hostname
        });
    }
    
    // Expose config globally
    window.APP_CONFIG = config;
    
    // Also expose as API_BASE for backward compatibility
    window.API_BASE = config.API_BASE_URL;
    
})(window);

