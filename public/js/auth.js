/**
 * Authentication Utility
 * Handles JWT token management and authenticated API requests
 */

(function(window) {
    'use strict';
    
    const AUTH_UTILS = {
        // Token storage keys
        TOKEN_KEY: 'authToken',
        USER_KEY: 'authUser',
        ROLE_KEY: 'authRole',
        
        /**
         * Store authentication data
         */
        setAuth(token, user, role) {
            localStorage.setItem(this.TOKEN_KEY, token);
            localStorage.setItem(this.USER_KEY, JSON.stringify(user));
            localStorage.setItem(this.ROLE_KEY, role);
        },
        
        /**
         * Get stored token
         */
        getToken() {
            return localStorage.getItem(this.TOKEN_KEY);
        },
        
        /**
         * Get stored user
         */
        getUser() {
            const user = localStorage.getItem(this.USER_KEY);
            return user ? JSON.parse(user) : null;
        },
        
        /**
         * Get stored role
         */
        getRole() {
            return localStorage.getItem(this.ROLE_KEY);
        },
        
        /**
         * Check if user is authenticated
         */
        isAuthenticated() {
            return !!this.getToken();
        },
        
        /**
         * Clear authentication data
         */
        clearAuth() {
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
            localStorage.removeItem(this.ROLE_KEY);
            
            // Also clear legacy keys
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            localStorage.removeItem('trainerToken');
            localStorage.removeItem('hodToken');
        },
        
        /**
         * Make authenticated API request
         */
        async fetch(url, options = {}) {
            const token = this.getToken();
            
            if (!token) {
                throw new Error('No authentication token found');
            }
            
            // Add Authorization header
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            };
            
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            // Handle token expiration
            if (response.status === 401) {
                const data = await response.json();
                if (data.code === 'TOKEN_EXPIRED' || data.code === 'INVALID_TOKEN') {
                    this.clearAuth();
                    window.location.href = '/admin/login';
                    throw new Error('Session expired. Please login again.');
                }
            }
            
            return response;
        },
        
        /**
         * Make authenticated GET request
         */
        async get(url) {
            const response = await this.fetch(url, { method: 'GET' });
            return response.json();
        },
        
        /**
         * Make authenticated POST request
         */
        async post(url, data) {
            const response = await this.fetch(url, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            return response.json();
        },
        
        /**
         * Make authenticated PUT request
         */
        async put(url, data) {
            const response = await this.fetch(url, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            return response.json();
        },
        
        /**
         * Make authenticated DELETE request
         */
        async delete(url) {
            const response = await this.fetch(url, { method: 'DELETE' });
            return response.json();
        },
        
        /**
         * Redirect to login if not authenticated
         */
        requireAuth(loginUrl = '/admin/login') {
            if (!this.isAuthenticated()) {
                window.location.href = loginUrl;
                return false;
            }
            return true;
        },
        
        /**
         * Migrate legacy tokens to new system
         */
        migrateLegacyTokens() {
            // Check for admin token
            const adminToken = localStorage.getItem('adminToken');
            const adminUser = localStorage.getItem('adminUser');
            
            if (adminToken && !this.getToken()) {
                const user = adminUser ? JSON.parse(adminUser) : {};
                this.setAuth(adminToken, user, user.role || 'admin');
                console.log('✅ Migrated admin token to new auth system');
            }
            
            // Check for trainer token
            const trainerToken = localStorage.getItem('trainerToken');
            if (trainerToken && !this.getToken()) {
                this.setAuth(trainerToken, {}, 'trainer');
                console.log('✅ Migrated trainer token to new auth system');
            }
            
            // Check for HOD token
            const hodToken = localStorage.getItem('hodToken');
            if (hodToken && !this.getToken()) {
                this.setAuth(hodToken, {}, 'hod');
                console.log('✅ Migrated HOD token to new auth system');
            }
        }
    };
    
    // Auto-migrate legacy tokens on load
    AUTH_UTILS.migrateLegacyTokens();
    
    // Expose globally
    window.AUTH = AUTH_UTILS;
    
})(window);
