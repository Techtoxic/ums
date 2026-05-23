/**
 * EDTTI UMS — V2 Postgres schema (Drizzle ORM).
 *
 * Conventions:
 *   - Table names: snake_case plural
 *   - Column names: snake_case
 *   - Primary keys: UUID v4 via defaultRandom()
 *   - Foreign keys: <table_singular>_id
 *   - Audit columns: created_at, updated_at on every table (timestamptz, default now())
 *   - Soft-delete on important tables: deleted_at timestamptz nullable
 *   - Money columns: numeric(12, 2) — used ONLY on TEMPORARY payments/payslips tables
 *   - Emails: lowercase text + unique index (we normalize at the app layer rather than citext)
 *
 * Out-of-scope-for-now tables (payments, payslips) are kept V1-flat and marked
 * TEMPORARY: they will be redesigned in a later phase once the EDTTI fee
 * structure is finalized.
 */

const {
    pgTable,
    pgEnum,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    date,
    numeric,
    jsonb,
    index,
    uniqueIndex,
} = require('drizzle-orm/pg-core');

// ============================================================================
// ENUMS
// ============================================================================
const userRoleEnum = pgEnum('user_role', [
    'admin',
    'registrar',
    'finance',
    'dean',
    'deputy',
    'ilo',
    'cibec',
    'hod',
    'trainer',
]);

const studentStatusEnum = pgEnum('student_status', [
    'active',
    'on_leave',
    'deferred',
    'graduated',
    'dropped_out',
    'dismissed',
]);

const intakeEnum = pgEnum('intake', ['september', 'january']);

const enrollmentStatusEnum = pgEnum('enrollment_status', [
    'active',
    'completed',
    'withdrawn',
]);

const toolRequestStatusEnum = pgEnum('tool_request_status', [
    'pending',
    'approved',
    'rejected',
    'fulfilled',
]);

const attachmentStatusEnum = pgEnum('attachment_status', [
    'pending',
    'approved',
    'completed',
    'rejected',
]);

const graduationStatusEnum = pgEnum('graduation_status', [
    'pending',
    'verifying',
    'approved',
    'rejected',
]);

const recipientTypeEnum = pgEnum('recipient_type', ['student', 'user']);

const paymentModeEnum = pgEnum('payment_mode', ['mpesa', 'bank', 'bursary']);

// ============================================================================
// USERS  — admin staff + HODs + trainers, unified by role
// ============================================================================
const users = pgTable(
    'users',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        role: userRoleEnum('role').notNull(),
        staff_id: text('staff_id'),
        name: text('name').notNull(),
        email: text('email').notNull(),
        password: text('password').notNull(),
        department: text('department'),
        phone: text('phone'),
        is_active: boolean('is_active').notNull().default(true),
        is_first_login: boolean('is_first_login').notNull().default(false),
        must_update_email: boolean('must_update_email').notNull().default(false),
        must_update_password: boolean('must_update_password').notNull().default(false),
        email_verified: boolean('email_verified').notNull().default(false),
        login_attempts: integer('login_attempts').notNull().default(0),
        last_login: timestamp('last_login', { withTimezone: true }),
        last_password_change: timestamp('last_password_change', { withTimezone: true }),
        token_version: integer('token_version').notNull().default(0),
        lock_until: timestamp('lock_until', { withTimezone: true }),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deleted_at: timestamp('deleted_at', { withTimezone: true }),
    },
    (t) => ({
        emailUnique: uniqueIndex('users_email_unique').on(t.email),
        staffIdUnique: uniqueIndex('users_staff_id_unique').on(t.staff_id),
        roleActiveIdx: index('users_role_is_active_idx').on(t.role, t.is_active),
    }),
);

// ============================================================================
// STUDENTS  — separate identity model from staff/users
// ============================================================================
const students = pgTable(
    'students',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        admission_number: text('admission_number').notNull(),
        name: text('name').notNull(),
        id_number: text('id_number'),
        kcse_grade: text('kcse_grade'),
        course: text('course').notNull(),
        department: text('department').notNull(),
        year: integer('year').notNull().default(1),
        intake: intakeEnum('intake'),
        intake_year: integer('intake_year').notNull(),
        phone_number: text('phone_number').notNull(),
        email: text('email'),
        admission_type: text('admission_type'),
        password: text('password').notNull(),
        role: text('role').notNull().default('student'),
        is_active: boolean('is_active').notNull().default(true),
        token_version: integer('token_version').notNull().default(0),
        status: studentStatusEnum('status').notNull().default('active'),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deleted_at: timestamp('deleted_at', { withTimezone: true }),
    },
    (t) => ({
        admissionNumberUnique: uniqueIndex('students_admission_number_unique').on(t.admission_number),
        idNumberUnique: uniqueIndex('students_id_number_unique').on(t.id_number),
        departmentIdx: index('students_department_idx').on(t.department),
        yearIntakeIdx: index('students_year_intake_year_idx').on(t.year, t.intake_year),
    }),
);

// ============================================================================
// DEPARTMENTS
// ============================================================================
const departments = pgTable('departments', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    nameUnique: uniqueIndex('departments_name_unique').on(t.name),
    codeUnique: uniqueIndex('departments_code_unique').on(t.code),
}));

// ============================================================================
// PROGRAMS
// ============================================================================
const programs = pgTable(
    'programs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        department_id: uuid('department_id').references(() => departments.id),
        name: text('name').notNull(),
        code: text('code').notNull(),
        level: integer('level').notNull(),
        program_cost: numeric('program_cost', { precision: 12, scale: 2 }).notNull().default('0'),
        duration_years: integer('duration_years').notNull().default(3),
        is_active: boolean('is_active').notNull().default(true),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deleted_at: timestamp('deleted_at', { withTimezone: true }),
    },
    (t) => ({
        codeUnique: uniqueIndex('programs_code_unique').on(t.code),
        departmentIdx: index('programs_department_id_idx').on(t.department_id),
    }),
);

// ============================================================================
// UNITS  (subjects within a program)
// ============================================================================
const units = pgTable(
    'units',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        program_id: uuid('program_id').references(() => programs.id),
        code: text('code').notNull(),
        name: text('name').notNull(),
        year: integer('year').notNull(),
        semester: integer('semester').notNull(),
        is_common: boolean('is_common').notNull().default(false),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deleted_at: timestamp('deleted_at', { withTimezone: true }),
    },
    (t) => ({
        programIdx: index('units_program_id_idx').on(t.program_id),
        yearSemIdx: index('units_year_semester_idx').on(t.year, t.semester),
    }),
);

// ============================================================================
// COMMON UNIT ASSIGNMENTS  (a unit shared across multiple programs)
// ============================================================================
const commonUnitAssignments = pgTable('common_unit_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    unit_id: uuid('unit_id').notNull().references(() => units.id),
    program_id: uuid('program_id').notNull().references(() => programs.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// TRAINER ASSIGNMENTS
// ============================================================================
const trainerAssignments = pgTable(
    'trainer_assignments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        trainer_id: uuid('trainer_id').notNull().references(() => users.id),
        unit_id: uuid('unit_id').notNull().references(() => units.id),
        academic_year: integer('academic_year').notNull(),
        semester: integer('semester').notNull(),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        trainerYearSemIdx: index('trainer_assignments_trainer_id_year_sem_idx').on(
            t.trainer_id,
            t.academic_year,
            t.semester,
        ),
    }),
);

// ============================================================================
// STUDENT ENROLLMENTS  (student → program)
// ============================================================================
const studentEnrollments = pgTable('student_enrollments', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id').notNull().references(() => students.id),
    program_id: uuid('program_id').notNull().references(() => programs.id),
    enrolled_at: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// UNIT REGISTRATIONS  (student takes a unit in a given year/semester)
// ============================================================================
const unitRegistrations = pgTable(
    'unit_registrations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        student_id: uuid('student_id').notNull().references(() => students.id),
        unit_id: uuid('unit_id').notNull().references(() => units.id),
        academic_year: integer('academic_year').notNull(),
        semester: integer('semester').notNull(),
        registered_at: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        studentYearSemIdx: index('unit_registrations_student_year_sem_idx').on(
            t.student_id,
            t.academic_year,
            t.semester,
        ),
    }),
);

// ============================================================================
// TOOL REQUESTS  (trainers ordering teaching tools)
// ============================================================================
const toolRequests = pgTable('tool_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    trainer_id: uuid('trainer_id').notNull().references(() => users.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    status: toolRequestStatusEnum('status').notNull().default('pending'),
    requested_at: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    responded_by: uuid('responded_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// ATTACHMENT APPLICATIONS
// ============================================================================
const attachmentApplications = pgTable('attachment_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id').notNull().references(() => students.id),
    company_name: text('company_name'),
    start_date: date('start_date'),
    end_date: date('end_date'),
    county: text('county'),
    nearest_town: text('nearest_town'),
    status: attachmentStatusEnum('status').notNull().default('pending'),
    comments: text('comments'),
    reviewed_by: uuid('reviewed_by').references(() => users.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// GRADUATION APPLICATIONS
// ============================================================================
const graduationApplications = pgTable('graduation_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id').notNull().references(() => students.id),
    status: graduationStatusEnum('status').notNull().default('pending'),
    applied_at: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    approved_by: uuid('approved_by').references(() => users.id),
    comments: text('comments'),
    reviewed_by: uuid('reviewed_by').references(() => users.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// NOTIFICATIONS  (polymorphic recipient — student or user)
// ============================================================================
const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    recipient_id: uuid('recipient_id').notNull(),
    recipient_type: recipientTypeEnum('recipient_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    is_read: boolean('is_read').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// STUDENT NOTES  (staff annotations on a student)
// ============================================================================
const studentNotes = pgTable('student_notes', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id').notNull().references(() => students.id),
    author_id: uuid('author_id').notNull().references(() => users.id),
    note: text('note').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// STUDENT UPLOADS  (file metadata; actual files in Spaces/S3 in the future)
// ============================================================================
const studentUploads = pgTable('student_uploads', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id').notNull().references(() => students.id),
    category: text('category').notNull(),
    file_name: text('file_name').notNull(),
    file_path: text('file_path').notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: text('mime_type').notNull(),
    uploaded_by: uuid('uploaded_by').notNull(),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// AUDIT LOGS  (append-only; no updated_at — events are immutable)
// ============================================================================
const auditLogs = pgTable(
    'audit_logs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        actor_id: uuid('actor_id'),
        actor_type: text('actor_type'),
        action: text('action').notNull(),
        resource_type: text('resource_type'),
        resource_id: uuid('resource_id'),
        details: jsonb('details'),
        ip_address: text('ip_address'),
        user_agent: text('user_agent'),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        actorCreatedIdx: index('audit_logs_actor_id_created_at_idx').on(t.actor_id, t.created_at),
        resourceIdx: index('audit_logs_resource_idx').on(t.resource_type, t.resource_id),
    }),
);

// ============================================================================
// SYSTEM SETTINGS  (key/value config; updated_by tracks who last changed)
// ============================================================================
const systemSettings = pgTable(
    'system_settings',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: text('key').notNull(),
        value: jsonb('value').notNull(),
        updated_by: uuid('updated_by').references(() => users.id),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        keyUnique: uniqueIndex('system_settings_key_unique').on(t.key),
    }),
);

// ============================================================================
// PASSWORD RESETS  (one-time tokens for forgot-password)
// ============================================================================
const passwordResets = pgTable('password_resets', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    token_hash: text('token_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    used_at: timestamp('used_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// LOGIN OTPs  (one-time codes for login MFA)
// ============================================================================
const loginOtps = pgTable('login_otps', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    user_id: uuid('user_id'),
    user_role: text('user_role'),
    code_hash: text('code_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    used_at: timestamp('used_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// TEMPORARY: PAYMENTS — flat V1-equivalent shape.
// TEMPORARY: redesign pending EDTTI fee structure clarification (see Phase 5 in architecture doc)
// ============================================================================
const payments = pgTable(
    'payments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        student_id: uuid('student_id').notNull().references(() => students.id),
        amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
        payment_mode: paymentModeEnum('payment_mode').notNull(),
        bank_name: text('bank_name'),
        payment_date: timestamp('payment_date', { withTimezone: true }).notNull().defaultNow(),
        reference_number: text('reference_number'),
        recorded_by: uuid('recorded_by').references(() => users.id),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        studentDateIdx: index('payments_student_id_payment_date_idx').on(t.student_id, t.payment_date),
    }),
);

// ============================================================================
// TEMPORARY: PAYSLIPS — flat V1-equivalent shape.
// TEMPORARY: redesign pending EDTTI fee structure clarification (see Phase 5 in architecture doc)
// ============================================================================
const payslips = pgTable(
    'payslips',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        trainer_id: uuid('trainer_id').notNull().references(() => users.id),
        month: text('month').notNull(),
        year: integer('year').notNull(),
        amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
        gross_pay: numeric('gross_pay', { precision: 12, scale: 2 }),
        net_pay: numeric('net_pay', { precision: 12, scale: 2 }),
        paye: numeric('paye', { precision: 12, scale: 2 }),
        nhif: numeric('nhif', { precision: 12, scale: 2 }),
        nssf: numeric('nssf', { precision: 12, scale: 2 }),
        payment_date: date('payment_date'),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        trainerYearMonthIdx: index('payslips_trainer_year_month_idx').on(t.trainer_id, t.year, t.month),
    }),
);

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // enums
    userRoleEnum,
    studentStatusEnum,
    intakeEnum,
    enrollmentStatusEnum,
    toolRequestStatusEnum,
    attachmentStatusEnum,
    graduationStatusEnum,
    recipientTypeEnum,
    paymentModeEnum,
    // tables
    users,
    students,
    departments,
    programs,
    units,
    commonUnitAssignments,
    trainerAssignments,
    studentEnrollments,
    unitRegistrations,
    toolRequests,
    attachmentApplications,
    graduationApplications,
    notifications,
    studentNotes,
    studentUploads,
    auditLogs,
    systemSettings,
    passwordResets,
    loginOtps,
    payments,
    payslips,
};
