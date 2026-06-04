// courseCodes.js — canonical course → registration code map.
//
// Used by both the registration handler (to construct admission numbers like
// "BM5/2503/J26") and the export/display helpers (so course name labels stay
// consistent regardless of where the data is rendered).
//
// IMPORTANT: keep this file in sync with the courseConfig object in
// src/components/registrar/portal-core.js. The map below is the canonical
// server-side mirror of that frontend object.

// COURSE_CONFIG maps legacy snake_case course keys (stored on old student records)
// to the canonical program codes that now live in the `programs` table.
// Codes are derived from catalogData.js codePrefix + level (e.g. AB + 6 = AB6).
// Keep in sync with drizzle/catalogData.js whenever programs are added/removed.
const COURSE_CONFIG = Object.freeze({
    // Applied Science Department (catalogData codePrefix: AC, AB, SLT)
    applied_biology_6:                  { code: 'AB6',   department: 'applied_science',      name: 'Applied Biology Level 6' },
    analytical_chemistry_6:             { code: 'AC6',   department: 'applied_science',      name: 'Analytical Chemistry Level 6' },
    science_laboratory_technology_5:    { code: 'SLT5',  department: 'applied_science',      name: 'Science Laboratory Technology Level 5' },
    science_laboratory_technology_6:    { code: 'SLT6',  department: 'applied_science',      name: 'Science Laboratory Technology Level 6' },

    // Agriculture Department (catalogData codePrefix: GA)
    general_agriculture_4:              { code: 'GA4',   department: 'agriculture',           name: 'Agricultural Extension Level 4' },
    agricultural_extension_4:           { code: 'GA4',   department: 'agriculture',           name: 'Agricultural Extension Level 4' },
    agricultural_extension_5:           { code: 'GA5',   department: 'agriculture',           name: 'Agricultural Extension Level 5' },
    sustainable_agriculture_5:          { code: 'GA5',   department: 'agriculture',           name: 'Agricultural Extension Level 5' },
    agricultural_extension_6:           { code: 'GA6',   department: 'agriculture',           name: 'Agricultural Extension Level 6' },

    // Building and Civil Department (catalogData codePrefix: BT, PL)
    building_technology_3:              { code: 'BT3',   department: 'building_civil',        name: 'Building Technology Level 3' },
    building_technology_4:              { code: 'BT4',   department: 'building_civil',        name: 'Building Technology Level 4' },
    building_technician_4:              { code: 'BT4',   department: 'building_civil',        name: 'Building Technology Level 4' },
    building_technology_5:              { code: 'BT5',   department: 'building_civil',        name: 'Building Technology Level 5' },
    building_technology_6:              { code: 'BT6',   department: 'building_civil',        name: 'Building Technology Level 6' },
    building_technician_6:              { code: 'BT6',   department: 'building_civil',        name: 'Building Technology Level 6' },
    plumbing_3:                         { code: 'PL3',   department: 'building_civil',        name: 'Plumbing Level 3' },
    plumbing_4:                         { code: 'PL4',   department: 'building_civil',        name: 'Plumbing Level 4' },
    plumbing_5:                         { code: 'PL5',   department: 'building_civil',        name: 'Plumbing Level 5' },

    // Electromechanical Department (catalogData codePrefix: EE, MA)
    electrical_engineering_3:           { code: 'EE3',   department: 'electromechanical',     name: 'Electrical Engineering Level 3' },
    electrical_engineering_4:           { code: 'EE4',   department: 'electromechanical',     name: 'Electrical Engineering Level 4' },
    electrical_engineering_5:           { code: 'EE5',   department: 'electromechanical',     name: 'Electrical Engineering Level 5' },
    electrical_engineering_6:           { code: 'EE6',   department: 'electromechanical',     name: 'Electrical Engineering Level 6' },
    automotive_engineering_3:           { code: 'MA3',   department: 'electromechanical',     name: 'Automotive Engineering Level 3' },
    automotive_engineering_4:           { code: 'MA4',   department: 'electromechanical',     name: 'Automotive Engineering Level 4' },
    automotive_engineering_5:           { code: 'MA5',   department: 'electromechanical',     name: 'Automotive Engineering Level 5' },
    automotive_engineering_6:           { code: 'MA6',   department: 'electromechanical',     name: 'Automotive Engineering Level 6' },

    // Hospitality Department (catalogData codePrefix: FB, FD, COS, TTM)
    food_and_beverage_4:                { code: 'FB4',   department: 'hospitality',           name: 'Food and Beverage Level 4' },
    food_and_beverage_5:                { code: 'FB5',   department: 'hospitality',           name: 'Food and Beverage Level 5' },
    food_and_beverage_6:                { code: 'FB6',   department: 'hospitality',           name: 'Food and Beverage Level 6' },
    fashion_and_design_3:               { code: 'FD3',   department: 'hospitality',           name: 'Fashion and Design Level 3' },
    fashion_and_design_4:               { code: 'FD4',   department: 'hospitality',           name: 'Fashion and Design Level 4' },
    fashion_and_design_5:               { code: 'FD5',   department: 'hospitality',           name: 'Fashion and Design Level 5' },
    fashion_and_design_6:               { code: 'FD6',   department: 'hospitality',           name: 'Fashion and Design Level 6' },
    cosmetology_3:                      { code: 'COS3',  department: 'hospitality',           name: 'Cosmetology Level 3' },
    cosmetology_4:                      { code: 'COS4',  department: 'hospitality',           name: 'Cosmetology Level 4' },
    hairdressing_4:                     { code: 'COS4',  department: 'hospitality',           name: 'Cosmetology Level 4' },
    cosmetology_5:                      { code: 'COS5',  department: 'hospitality',           name: 'Cosmetology Level 5' },
    hairdressing_5:                     { code: 'COS5',  department: 'hospitality',           name: 'Cosmetology Level 5' },
    cosmetology_6:                      { code: 'COS6',  department: 'hospitality',           name: 'Cosmetology Level 6' },
    hairdressing_6:                     { code: 'COS6',  department: 'hospitality',           name: 'Cosmetology Level 6' },
    tour_and_travel_management_5:       { code: 'TTM5',  department: 'hospitality',           name: 'Tour and Travel Management Level 5' },
    tourism_management_5:               { code: 'TTM5',  department: 'hospitality',           name: 'Tour and Travel Management Level 5' },
    tour_and_travel_management_6:       { code: 'TTM6',  department: 'hospitality',           name: 'Tour and Travel Management Level 6' },
    tourism_management_6:               { code: 'TTM6',  department: 'hospitality',           name: 'Tour and Travel Management Level 6' },

    // Business and Liberal Studies Department (catalogData codePrefix: BM, SK, OA, SW)
    business_management_5:              { code: 'BM5',   department: 'business_liberal',      name: 'Business Management Level 5' },
    business_management_6:              { code: 'BM6',   department: 'business_liberal',      name: 'Business Management Level 6' },
    storekeeping_4:                     { code: 'SK4',   department: 'business_liberal',      name: 'Storekeeping Level 4' },
    office_administration_4:            { code: 'OA4',   department: 'business_liberal',      name: 'Office Administration Level 4' },
    office_administration_5:            { code: 'OA5',   department: 'business_liberal',      name: 'Office Administration Level 5' },
    office_administration_6:            { code: 'OA6',   department: 'business_liberal',      name: 'Office Administration Level 6' },
    social_work_5:                      { code: 'SW5',   department: 'business_liberal',      name: 'Social Work Level 5' },
    social_work_6:                      { code: 'SW6',   department: 'business_liberal',      name: 'Social Work Level 6' },

    // Computing and Informatics Department (catalogData codePrefix: ICT, LIS)
    ict_4:                              { code: 'ICT4',  department: 'computing_informatics', name: 'ICT Level 4' },
    ict_5:                              { code: 'ICT5',  department: 'computing_informatics', name: 'ICT Level 5' },
    ict_6:                              { code: 'ICT6',  department: 'computing_informatics', name: 'ICT Level 6' },
    library_and_information_science_5:  { code: 'LIS5',  department: 'computing_informatics', name: 'Library and Information Science Level 5' },
    information_science_5:              { code: 'LIS5',  department: 'computing_informatics', name: 'Library and Information Science Level 5' },
    library_and_information_science_6:  { code: 'LIS6',  department: 'computing_informatics', name: 'Library and Information Science Level 6' },
    information_science_6:              { code: 'LIS6',  department: 'computing_informatics', name: 'Library and Information Science Level 6' },
});

// Reverse lookup: registration code (e.g. "GA6", "ICT5") -> canonical display
// name. Many student rows store the SHORT CODE in the `course` column rather
// than the snake_case key, so getCourseDisplayName must be able to resolve a
// code back to its full name — otherwise portals/receipts show the raw code
// (e.g. "GA6") instead of "Agricultural Extension Level 6". Built once from
// COURSE_CONFIG; first name wins when multiple keys share a code.
const CODE_TO_NAME = Object.freeze(
    Object.values(COURSE_CONFIG).reduce((map, { code, name }) => {
        if (code && !map[code]) map[code] = name;
        return map;
    }, {})
);

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
    // Stored as a short registration code (e.g. "GA6", "ICT5", "AB6")? Resolve
    // it back to the full display name so portals/receipts never show the code.
    const upper = key.toUpperCase();
    if (CODE_TO_NAME[upper]) return CODE_TO_NAME[upper];
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
