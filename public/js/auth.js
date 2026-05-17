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
            
            // Add Authorization header. Default the JSON Content-Type only for
            // non-FormData bodies — for multipart uploads the browser must set
            // its own Content-Type (with the boundary), so we must NOT force
            // application/json. (Stage 2B-1B: required so upload calls can be
            // normalized through this helper without breaking multipart.)
            const isFormData = (typeof FormData !== 'undefined') && (options.body instanceof FormData);
            const headers = {
                ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

    // ==========================================================================
    // Stage 2B-2A: centralized output-encoding helpers (XSS escaping).
    // One source of truth, loaded by every dashboard (they all load auth.js).
    // Strictness >= every former local escapeHtml (those escaped at most
    // & < > " ' ; this also escapes / ). Do not loosen.
    // ==========================================================================

    // HTML text context (and safe for double-quoted attribute values too,
    // since " is escaped). Escapes & < > " ' /.
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\//g, '&#47;');
    }

    // HTML attribute context: escapeHtml plus backtick and space, so the value
    // is safe even in an unquoted attribute. Browsers decode &#32;/&#96; back
    // to space/backtick, so display is unaffected inside quoted attributes.
    function escapeAttr(value) {
        if (value === null || value === undefined) return '';
        return escapeHtml(value)
            .replace(/`/g, '&#96;')
            .replace(/ /g, '&#32;');
    }

    // JavaScript string context. Returns the escaped INNER content WITHOUT
    // surrounding quotes — the caller wraps it in quotes. Also neutralizes
    // </script>, HTML metacharacters and the JS line separators so it is safe
    // inside inline <script>/event-handler contexts.
    function escapeJs(value) {
        if (value === null || value === undefined) return '';
        const json = JSON.stringify(String(value));
        return json
            .slice(1, -1)
            .replace(/</g, '\\u003C')
            .replace(/>/g, '\\u003E')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    }

    window.escapeHtml = escapeHtml;
    window.escapeAttr = escapeAttr;
    window.escapeJs = escapeJs;
    window.ESC = { escapeHtml: escapeHtml, escapeAttr: escapeAttr, escapeJs: escapeJs };

})(window);
