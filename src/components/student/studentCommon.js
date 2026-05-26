// studentCommon.js — shared base for the student portal.
// Holds the portal's shared globals + utilities on `window` so the classic
// scripts (studentPortal.js, uploadSection.js) READ them instead of each
// re-declaring top-level consts (two top-level `const authFetch`/`API_BASE_URL`
// on one page collide at parse time → SyntaxError, which killed uploadSection).
// MUST load AFTER /public/js/auth.js (needs window.AUTH + window.escapeHtml) and
// BEFORE studentPortal.js / uploadSection.js.

window.API_BASE_URL = window.API_BASE_URL || (window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`);

// Authenticated fetch wrapper for student — guarded against double-declaration.
// uploadSection.js also defines authFetch; both load as classic scripts on the
// same page, so a bare top-level `const` collides (SyntaxError). window
// assignment is idempotent regardless of load order.
window.authFetch = window.authFetch || (async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects.
    return window.AUTH.fetch(url, options);
});

// Get student data from session storage
window.studentData = JSON.parse(sessionStorage.getItem('studentData')) || {};

// Course to Program Name Mapping
window.courseToProgram = {
    'applied_biology_6': 'Applied Biology Level 6',
    'analytical_chemistry_6': 'Analytical Chemistry Level 6',
    'science_lab_technology_5': 'Science Lab Technology Level 5',
    'general_agriculture_4': 'General Agriculture Level 4',
    'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
    'agricultural_extension_6': 'Agricultural Extension Level 6',
    'building_technician_4': 'Building Technician Level 4',
    'building_technician_6': 'Building Technician Level 6',
    'civil_engineering_6': 'Civil Engineering Level 6',
    'plumbing_4': 'Plumbing Level 4',
    'plumbing_5': 'Plumbing Level 5',
    'electrical_engineering_4': 'Electrical Engineering Level 4',
    'electrical_engineering_5': 'Electrical Engineering Level 5',
    'electrical_engineering_6': 'Electrical Engineering Level 6',
    'automotive_engineering_5': 'Automotive Engineering Level 5',
    'automotive_engineering_6': 'Automotive Engineering Level 6',
    'food_beverage_4': 'Food and Beverage Level 4',
    'food_beverage_5': 'Food & Beverage Level 5',
    'food_beverage_6': 'Food & Beverage Level 6',
    'food_and_beverage_4': 'Food and Beverage Level 4',
    'food_and_beverage_5': 'Food & Beverage Level 5',
    'food_and_beverage_6': 'Food & Beverage Level 6',
    'fashion_design_4': 'Fashion & Design Level 4',
    'fashion_design_5': 'Fashion and Design Level 5',
    'fashion_design_6': 'Fashion and Design Level 6',
    'fashion_and_design_4': 'Fashion & Design Level 4',
    'fashion_and_design_5': 'Fashion and Design Level 5',
    'fashion_and_design_6': 'Fashion and Design Level 6',
    'hairdressing_4': 'Hairdressing Level 4',
    'hairdressing_5': 'Hairdressing Level 5',
    'hairdressing_6': 'Hairdressing Level 6',
    'tourism_management_5': 'Tourism Management Level 5',
    'tourism_management_6': 'Tourism Management Level 6',
    'social_work_5': 'Social Work Level 5',
    'social_work_6': 'Social Work Level 6',
    'office_administration_5': 'Office Administration Level 5',
    'office_administration_6': 'Office Administration Level 6',
    'ict_5': 'ICT Level 5',
    'ict_6': 'ICT Level 6',
    'information_science_5': 'Information Science Level 5',
    'information_science_6': 'Information Science Level 6',
    // Additional variations for comprehensive mapping
    'science_lab_tech_5': 'Science Lab Technology Level 5',
    'science_laboratory_technology_5': 'Science Lab Technology Level 5',
    'applied_bio_6': 'Applied Biology Level 6',
    'analytical_chem_6': 'Analytical Chemistry Level 6',
    'general_agric_4': 'General Agriculture Level 4',
    'sustainable_agric_5': 'Sustainable Agriculture Level 5',
    'agricultural_ext_6': 'Agricultural Extension Level 6',
    'building_tech_4': 'Building Technician Level 4',
    'building_tech_6': 'Building Technician Level 6',
    'civil_eng_6': 'Civil Engineering Level 6',
    'electrical_eng_4': 'Electrical Engineering Level 4',
    'electrical_eng_5': 'Electrical Engineering Level 5',
    'electrical_eng_6': 'Electrical Engineering Level 6',
    'automotive_eng_5': 'Automotive Engineering Level 5',
    'automotive_eng_6': 'Automotive Engineering Level 6',
    'tourism_mgmt_5': 'Tourism Management Level 5',
    'tourism_mgmt_6': 'Tourism Management Level 6',
    'office_admin_5': 'Office Administration Level 5',
    'office_admin_6': 'Office Administration Level 6',
    'info_science_5': 'Information Science Level 5',
    'info_science_6': 'Information Science Level 6',
    // Additional course code variations to ensure all formats work
    'agricultural_extension_6': 'Agricultural Extension Level 6',
    'agricultural_ext_6': 'Agricultural Extension Level 6',
    'agric_extension_6': 'Agricultural Extension Level 6',
    'building_technician_4': 'Building Technician Level 4',
    'building_technician_6': 'Building Technician Level 6',
    'building_tech_4': 'Building Technician Level 4',
    'building_tech_6': 'Building Technician Level 6'
};

// Department Mapping
window.departmentMapping = {
    'applied_science': 'Applied Science Department',
    'agriculture': 'Agriculture Department',
    'building_civil': 'Building and Civil Department',
    'electromechanical': 'Electromechanical Department',
    'hospitality': 'Hospitality Department',
    'business_liberal': 'Business and Liberal Studies',
    'computing_informatics': 'Computing and Informatics'
};

// Format currency
window.formatCurrency = function formatCurrency(amount) {
    if (amount === null || amount === undefined) return 'KES 0';
    return `KES ${Number(amount).toLocaleString()}`;
};

// Format time ago
window.formatTimeAgo = function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
};

// Toast notification function (if not already exists)
window.showToast = function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm transform translate-x-full transition-transform duration-300 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    }`;

    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="ri-${
                type === 'success' ? 'check' :
                type === 'error' ? 'error-warning' :
                type === 'warning' ? 'alert' :
                'information'
            }-line"></i>
            <span>${escapeHtml(message)}</span>
        </div>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    }, 100);

    // Remove after delay
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};
