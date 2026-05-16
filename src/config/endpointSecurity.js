/**
 * Endpoint Security Configuration
 * Defines which roles can access which endpoints
 */

const ENDPOINT_PERMISSIONS = {
    // Student endpoints
    '/api/students': ['admin', 'registrar', 'dean', 'finance'],
    '/api/students/:id': ['admin', 'registrar', 'student'], // + ownership check
    '/api/students/department/:department': ['admin', 'registrar', 'hod', 'dean'],
    '/api/students/admission/:admissionNumber': ['admin', 'registrar', 'finance'],
    '/api/students/:studentId/payments': ['admin', 'finance', 'student'], // + ownership
    '/api/students/:studentId/registrations': ['admin', 'registrar', 'student'], // + ownership
    '/api/students/:studentId/can-register': ['admin', 'registrar', 'student'], // + ownership
    '/api/students/export/:admissionType': ['admin', 'registrar'],
    
    // Payment endpoints
    '/api/payments': ['admin', 'finance', 'registrar'],
    '/api/payments/student/:studentId': ['admin', 'finance', 'student'], // + ownership
    
    // Program endpoints
    '/api/programs': ['public'], // Needed for registration
    '/api/programs/:id': ['public'],
    
    // Unit endpoints
    '/api/units': ['admin', 'registrar', 'hod'],
    '/api/units/course/:courseCode': ['admin', 'registrar', 'student', 'hod'],
    '/api/units/department/:department': ['admin', 'registrar', 'hod'],
    
    // Trainer endpoints
    '/api/trainers': ['admin', 'hod', 'registrar'],
    '/api/trainers/department/:department': ['admin', 'hod', 'registrar'],
    '/api/trainers/:trainerId/email': ['admin', 'trainer'], // + ownership
    '/api/trainers/:trainerId/password': ['admin', 'trainer'], // + ownership
    
    // HOD endpoints
    '/api/hod/departments': ['public'], // Needed for login
    '/api/hod/:hodId/profile': ['admin', 'hod'], // + ownership
    
    // Assignment endpoints
    '/api/assignments/department/:department': ['admin', 'hod', 'registrar'],
    '/api/assignments/assign': ['admin', 'hod'],
    '/api/assignments/unassign': ['admin', 'hod'],
    
    // Common unit endpoints
    '/api/common-units': ['admin', 'registrar', 'hod'],
    '/api/common-units/:unitCode': ['admin', 'registrar', 'hod'],
    '/api/common-unit-assignments': ['admin', 'registrar', 'hod'],
    
    // Tool request endpoints
    '/api/tool-requests': ['admin', 'trainer', 'hod'],
    '/api/tool-requests/trainer/:email': ['admin', 'trainer'], // + ownership
    
    // Graduation endpoints
    '/api/students/:studentId/graduation-eligibility': ['admin', 'registrar', 'student'], // + ownership
    '/api/graduation-applications': ['admin', 'registrar'],
    '/api/graduation-applications/:id': ['admin', 'registrar', 'student'], // + ownership
    
    // Attachment endpoints
    '/api/students/:studentId/attachment-eligibility': ['admin', 'registrar', 'student'], // + ownership
    '/api/attachment-applications': ['admin', 'registrar'],
    '/api/attachment-applications/:id': ['admin', 'registrar', 'student'], // + ownership
    
    // Notification endpoints
    '/api/notifications/:recipientId': ['admin', 'student', 'trainer', 'hod'], // + ownership
    
    // Student notes endpoints
    '/api/students/:studentId/notes': ['admin', 'registrar'],
    '/api/students/:studentId/public-notes': ['student'], // Public notes visible to all students
    
    // Payslip endpoints
    '/api/payslips': ['admin', 'finance'],
    '/api/payslips/trainer/:trainerId': ['admin', 'finance', 'trainer'], // + ownership
    
    // Audit log endpoints
    '/api/audit-logs': ['admin'],
    
    // System settings endpoints
    '/api/system-settings': ['admin'],
    '/api/system-settings/:key': ['admin']
};

// Public endpoints (no authentication required)
const PUBLIC_ENDPOINTS = [
    '/api/auth/forgot-password',
    '/api/auth/verify-otp',
    '/api/auth/reset-password',
    '/api/auth/validate-reset-token/:token',
    '/api/admin/auth/login',
    '/api/admin/auth/verify-otp',
    '/api/hod/login',
    '/api/trainers/login',
    '/api/hod/departments',
    '/api/programs',
    '/api/programs/:id',
    '/api/courses'
];

// Endpoints that require ownership verification
const OWNERSHIP_ENDPOINTS = {
    '/api/students/:id': 'id',
    '/api/students/:studentId/payments': 'studentId',
    '/api/students/:studentId/registrations': 'studentId',
    '/api/students/:studentId/can-register': 'studentId',
    '/api/students/:studentId/graduation-eligibility': 'studentId',
    '/api/students/:studentId/attachment-eligibility': 'studentId',
    '/api/payments/student/:studentId': 'studentId',
    '/api/trainers/:trainerId/email': 'trainerId',
    '/api/trainers/:trainerId/password': 'trainerId',
    '/api/hod/:hodId/profile': 'hodId',
    '/api/payslips/trainer/:trainerId': 'trainerId',
    '/api/notifications/:recipientId': 'recipientId'
};

module.exports = {
    ENDPOINT_PERMISSIONS,
    PUBLIC_ENDPOINTS,
    OWNERSHIP_ENDPOINTS
};
