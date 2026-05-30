// courseCodes.js — canonical course → registration code map.
//
// Used by both the registration handler (to construct admission numbers like
// "BM5/2503/J26") and the export/display helpers (so course name labels stay
// consistent regardless of where the data is rendered).
//
// IMPORTANT: keep this file in sync with the courseConfig object in
// src/components/registrar/portal-core.js. The map below is the canonical
// server-side mirror of that frontend object.

const COURSE_CONFIG = Object.freeze({
    // Applied Science Department
    applied_biology_6:                  { code: 'AP6', department: 'applied_science', name: 'Applied Biology Level 6' },
    analytical_chemistry_6:             { code: 'AC6', department: 'applied_science', name: 'Analytical Chemistry Level 6' },
    science_laboratory_technology_5:    { code: 'SLT5', department: 'applied_science', name: 'Science Laboratory Technology Level 5' },

    // Agriculture Department
    general_agriculture_4:              { code: 'GA4', department: 'agriculture', name: 'General Agriculture Level 4' },
    sustainable_agriculture_5:          { code: 'SA5', department: 'agriculture', name: 'Sustainable Agriculture Level 5' },
    agricultural_extension_6:           { code: 'AE6', department: 'agriculture', name: 'Agricultural Extension Level 6' },

    // Building and Civil Department
    building_technician_4:              { code: 'BT4', department: 'building_civil', name: 'Building Technician Level 4' },
    building_technician_6:              { code: 'BT6', department: 'building_civil', name: 'Building Technician Level 6' },
    civil_engineering_6:                { code: 'CE6', department: 'building_civil', name: 'Civil Engineering Level 6' },
    plumbing_4:                         { code: 'PL4', department: 'building_civil', name: 'Plumbing Level 4' },
    plumbing_5:                         { code: 'PL5', department: 'building_civil', name: 'Plumbing Level 5' },

    // Electromechanical Department
    electrical_engineering_4:           { code: 'EE4', department: 'electromechanical', name: 'Electrical Engineering Level 4' },
    electrical_engineering_5:           { code: 'EE5', department: 'electromechanical', name: 'Electrical Engineering Level 5' },
    electrical_engineering_6:           { code: 'EE6', department: 'electromechanical', name: 'Electrical Engineering Level 6' },
    automotive_engineering_5:           { code: 'AM5', department: 'electromechanical', name: 'Automotive Engineering Level 5' },
    automotive_engineering_6:           { code: 'AM6', department: 'electromechanical', name: 'Automotive Engineering Level 6' },

    // Hospitality Department
    food_and_beverage_4:                { code: 'FB4', department: 'hospitality', name: 'Food and Beverage Level 4' },
    food_and_beverage_5:                { code: 'FB5', department: 'hospitality', name: 'Food and Beverage Level 5' },
    food_and_beverage_6:                { code: 'FB6', department: 'hospitality', name: 'Food and Beverage Level 6' },
    fashion_and_design_4:               { code: 'FD4', department: 'hospitality', name: 'Fashion and Design Level 4' },
    fashion_and_design_5:               { code: 'FD5', department: 'hospitality', name: 'Fashion and Design Level 5' },
    fashion_and_design_6:               { code: 'FD6', department: 'hospitality', name: 'Fashion and Design Level 6' },
    hairdressing_4:                     { code: 'HD4', department: 'hospitality', name: 'Hairdressing Level 4' },
    hairdressing_5:                     { code: 'HD5', department: 'hospitality', name: 'Hairdressing Level 5' },
    hairdressing_6:                     { code: 'HD6', department: 'hospitality', name: 'Hairdressing Level 6' },
    tourism_management_5:               { code: 'TM5', department: 'hospitality', name: 'Tourism Management Level 5' },
    tourism_management_6:               { code: 'TM6', department: 'hospitality', name: 'Tourism Management Level 6' },

    // Business and Liberal Studies Department
    social_work_5:                      { code: 'SW5', department: 'business_liberal', name: 'Social Work Level 5' },
    social_work_6:                      { code: 'SW6', department: 'business_liberal', name: 'Social Work Level 6' },
    office_administration_5:            { code: 'OA5', department: 'business_liberal', name: 'Office Administration Level 5' },
    office_administration_6:            { code: 'OA6', department: 'business_liberal', name: 'Office Administration Level 6' },

    // Computing and Informatics Department
    ict_5:                              { code: 'ICT5', department: 'computing_informatics', name: 'ICT Level 5' },
    ict_6:                              { code: 'ICT6', department: 'computing_informatics', name: 'ICT Level 6' },
    information_science_5:              { code: 'IS5', department: 'computing_informatics', name: 'Information Science Level 5' },
    information_science_6:              { code: 'IS6', department: 'computing_informatics', name: 'Information Science Level 6' },
});

// Department display labels (human-readable, used by exports + listings).
const DEPARTMENT_LABELS = Object.freeze({
    applied_science:        'Applied Science Department',
    agriculture:            'Agriculture Department',
    building_civil:         'Building and Civil Department',
    electromechanical:      'Electromechanical Department',
    hospitality:            'Hospitality Department',
    business_liberal:       'Business and Liberal Studies',
    computing_informatics:  'Computing and Informatics',
});

// Resolve a course key to its registration code (e.g. "BM5"). Accepts either
// the canonical underscore-cased course id ("automotive_engineering_5") or an
// already-stored short code ("AM5"). Returns null when no match is found.
function getCourseCode(course) {
    if (!course) return null;
    const key = String(course).trim();
    if (COURSE_CONFIG[key]) return COURSE_CONFIG[key].code;
    // Tolerant pass: lowercase / underscore-normalised lookup.
    const norm = key.toLowerCase().replace(/\s+/g, '_');
    if (COURSE_CONFIG[norm]) return COURSE_CONFIG[norm].code;
    // Heuristic: if the value is already an UPPERCASE short code like "BM5" or
    // "ICT5", trust it. Anything else returns null so the caller can reject.
    if (/^[A-Z]{2,4}\d?$/.test(key)) return key;
    return null;
}

// Resolve a course key to its full display name (e.g. "Information Technology
// Level 5"). Falls back to a Title-Case transform of the underscore-separated
// course key so we never leak raw snake_case to the registrar UI.
function getCourseDisplayName(course) {
    if (!course) return '';
    const key = String(course).trim();
    if (COURSE_CONFIG[key]) return COURSE_CONFIG[key].name;
    const norm = key.toLowerCase().replace(/\s+/g, '_');
    if (COURSE_CONFIG[norm]) return COURSE_CONFIG[norm].name;
    // No match: fall back to readable formatting (underscores → spaces, Title
    // Case, append "Level N" if the key ends in a digit).
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\s(\d+)$/, ' Level $1');
}

// Resolve a department code to its human-readable label.
function getDepartmentDisplayName(department) {
    if (!department) return '';
    const key = String(department).trim();
    if (DEPARTMENT_LABELS[key]) return DEPARTMENT_LABELS[key];
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

module.exports = {
    COURSE_CONFIG,
    DEPARTMENT_LABELS,
    getCourseCode,
    getCourseDisplayName,
    getDepartmentDisplayName,
};
