// Inline helper for V1's HOD.getDepartmentDisplayName static. Used by the HOD
// login response so the frontend keeps receiving a human-readable label.
function hodDepartmentDisplayName(code) {
    const map = {
        applied_science:        'Applied Science',
        agriculture:            'Agriculture',
        building_civil:         'Building & Civil Engineering',
        electromechanical:      'Electromechanical Engineering',
        hospitality:            'Hospitality',
        business_liberal:       'Business & Liberal Studies',
        computing_informatics:  'Computing & Informatics',
    };
    return map[code] || code;
}

// V2: maps the snake_case department codes used in users/students.department
// to the 2-letter codes in the departments table. Used by endpoints that
// need to JOIN through programs → departments.
const DEPT_TEXT_TO_SHORT = {
    applied_science:        'AS',
    agriculture:            'AG',
    building_civil:         'BC',
    electromechanical:      'EM',
    hospitality:            'HO',
    business_liberal:       'BL',
    computing_informatics:  'IT',
};

// SEV-H-016: money is stored as Decimal128 for exactness. These helpers
// convert at the boundary. Choice (documented in STAGE2A_REPORT.md):
// arithmetic/comparisons are done in Number space via parseFloat(String(...));
// KES amounts are well within JS safe-integer range, and storage stays exact.
function toMoneyNumber(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(v.toString());
    return Number.isFinite(n) ? n : 0;
}
function toDecimal128(v) {
    // V2: Postgres numeric() accepts strings. Return a fixed-2 decimal string
    // for compatibility with all call sites that used to pass Decimal128.
    const n = toMoneyNumber(v);
    return n.toFixed(2);
}

// Utility function to format course names
function formatCourseNameServer(courseCode) {
    if (!courseCode) return 'Unknown Course';

    // Course name mappings
    const courseNames = {
        'analytical_chemistry_6': 'Analytical Chemistry',
        'sustainable_agriculture_5': 'Sustainable Agriculture',
        'building_technology_6': 'Building Technology',
        'electrical_installation_6': 'Electrical Installation',
        'food_beverage_6': 'Food & Beverage Service',
        'business_management_6': 'Business Management',
        'computer_science_6': 'Computer Science',
        'fashion_design_4': 'Fashion & Design',
        'science_laboratory_technology_6': 'Science Laboratory Technology',
        'crop_production_6': 'Crop Production',
        'civil_engineering_6': 'Civil Engineering',
        'mechanical_engineering_6': 'Mechanical Engineering',
        'hospitality_management_6': 'Hospitality Management',
        'accounting_6': 'Accounting',
        'information_technology_6': 'Information Technology',
        'interior_design_4': 'Interior Design'
    };

    return courseNames[courseCode] || courseCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

module.exports = { hodDepartmentDisplayName, toMoneyNumber, toDecimal128, formatCourseNameServer, DEPT_TEXT_TO_SHORT };
