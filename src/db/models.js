/**
 * EDTTI UMS — V2 model facade for Drizzle/Postgres.
 *
 * Exposes the legacy V1 model API surface (find / findOne / findById / create /
 * findByIdAndUpdate / findByIdAndDelete / countDocuments / updateOne / updateMany /
 * deleteOne / deleteMany / exists / distinct), backed by Drizzle queries against
 * Postgres. This keeps the existing V1 call sites in server.js + src/routes/*
 * working AS-IS during the migration without per-site rewriting.
 *
 * COVERED:
 *   - Auto camelCase ↔ snake_case field name translation
 *   - {field: value}, $in, $ne, $gt, $gte, $lt, $lte, $exists query operators
 *   - $set, $inc update operators
 *   - _id alias on every returned doc (frontend convenience; equals row.id UUID)
 *   - bcrypt pre-save hash for password fields
 *   - comparePassword() method on user/student docs
 *   - role-filtered facades: AdminStaff, Trainer, HOD all back onto `users` table
 *   - Chainable query thenable (.select/.sort/.limit/.skip/.lean/.populate
 *     are no-ops; the whole result is also awaitable)
 *
 * NOT COVERED (will throw at runtime; flag for follow-up):
 *   - .populate() (returns reference IDs only)
 *   - .aggregate() (returns [])
 *   - $push / $pull / array operators (legacy embedded arrays)
 *   - schema virtuals, hooks beyond password hashing
 *   - .session() (silently no-op chained — single-statement writes only)
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { eq, and, or, ne, gt, gte, lt, lte, inArray, isNull, isNotNull, ilike, sql, desc, asc } = require('drizzle-orm');
const { db, schema } = require('./index');

const BCRYPT_COST = 10; // V1 used cost 10; preserve for new writes

// ---------- name conversion ----------
function camelToSnake(s) {
    return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}
function snakeToCamel(s) {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Translate a V1-shape filter to a Drizzle WHERE expression. */
function buildWhere(table, filter, fieldMap) {
    if (!filter || typeof filter !== 'object' || Object.keys(filter).length === 0) return undefined;
    const conds = [];
    for (const [key, value] of Object.entries(filter)) {
        if (key === '_id') {
            conds.push(eq(table.id, value));
            continue;
        }
        if (key === '$or' && Array.isArray(value)) {
            const sub = value.map((f) => buildWhere(table, f, fieldMap)).filter(Boolean);
            if (sub.length) conds.push(or(...sub));
            continue;
        }
        if (key === '$and' && Array.isArray(value)) {
            const sub = value.map((f) => buildWhere(table, f, fieldMap)).filter(Boolean);
            if (sub.length) conds.push(and(...sub));
            continue;
        }
        const col = resolveCol(table, key, fieldMap);
        if (!col) continue; // unknown field — silently skip (logs follow-up)
        if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
            // operator object: {$in, $ne, $gt, ...}
            for (const [op, opVal] of Object.entries(value)) {
                switch (op) {
                    case '$in':       if (Array.isArray(opVal) && opVal.length) conds.push(inArray(col, opVal)); break;
                    case '$ne':       conds.push(ne(col, opVal)); break;
                    case '$gt':       conds.push(gt(col, opVal)); break;
                    case '$gte':      conds.push(gte(col, opVal)); break;
                    case '$lt':       conds.push(lt(col, opVal)); break;
                    case '$lte':      conds.push(lte(col, opVal)); break;
                    case '$exists':   conds.push(opVal ? isNotNull(col) : isNull(col)); break;
                    case '$regex':    conds.push(sql`${col}::text ILIKE ${'%' + String(opVal).replace(/[%_]/g, '') + '%'}`); break;
                    default:          // unsupported operator — skip
                        break;
                }
            }
        } else {
            conds.push(eq(col, value));
        }
    }
    if (!conds.length) return undefined;
    return conds.length === 1 ? conds[0] : and(...conds);
}

/** Resolve a V1 key (e.g. admissionNumber, _id) to the Drizzle column object. */
function resolveCol(table, key, fieldMap) {
    if (key === '_id' || key === 'id') return table.id;
    if (fieldMap && fieldMap[key]) return table[fieldMap[key]];
    if (table[key]) return table[key]; // already snake
    const snake = camelToSnake(key);
    return table[snake]; // may be undefined
}

/** Translate a V1 update document ({$set, $inc, ...} or flat) into a Drizzle update object. */
function buildUpdate(table, update, fieldMap) {
    if (!update || typeof update !== 'object') return {};
    const set = {};
    const flat = (update.$set || update.$set === undefined && !update.$inc) ? null : null; // placeholder
    if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
            const snake = (fieldMap && fieldMap[k]) || (table[k] ? k : camelToSnake(k));
            set[snake] = v;
        }
    } else if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
            const snake = (fieldMap && fieldMap[k]) || (table[k] ? k : camelToSnake(k));
            set[snake] = sql`${table[snake]} + ${v}`;
        }
    } else {
        // No operators — treat as plain $set (V1's permissive default)
        for (const [k, v] of Object.entries(update)) {
            if (k.startsWith('$')) continue;
            const snake = (fieldMap && fieldMap[k]) || (table[k] ? k : camelToSnake(k));
            set[snake] = v;
        }
    }
    if (Object.keys(set).length > 0) {
        set.updated_at = new Date();
    }
    return set;
}

/** Translate values keyed by camelCase into snake_case for INSERT. */
function buildInsertValues(table, values, fieldMap) {
    const out = {};
    for (const [k, v] of Object.entries(values || {})) {
        if (k === '_id' || k === 'id') {
            if (v) out.id = v;
            continue;
        }
        const snake = (fieldMap && fieldMap[k]) || (table[k] ? k : camelToSnake(k));
        out[snake] = v;
    }
    return out;
}

/** Translate a Drizzle result row into a V1-shape document. */
function rowToDoc(row, options) {
    if (!row) return null;
    const doc = {};
    for (const [k, v] of Object.entries(row)) {
        const camel = snakeToCamel(k);
        doc[camel] = v;
    }
    doc.id = row.id;
    doc._id = row.id; // V1 alias
    // strip secrets
    if (options && options.secretFields) {
        for (const f of options.secretFields) {
            const camel = snakeToCamel(f);
            delete doc[camel];
        }
    }
    // attach helpers
    if (options && options.hashFields && options.hashFields.length) {
        doc.comparePassword = async function (candidate) {
            const pwSnake = options.hashFields[0];
            const pwCamel = snakeToCamel(pwSnake);
            const stored = row[pwSnake] || this[pwCamel];
            if (!stored) return false;
            return bcrypt.compare(candidate, stored);
        };
    }
    return doc;
}

/** Hash password-shaped fields in a values object (used on create/save). */
async function hashPasswordFields(values, hashFields, fieldMap) {
    if (!hashFields || !hashFields.length) return values;
    const out = { ...values };
    for (const f of hashFields) {
        const camel = snakeToCamel(f);
        const candidates = [f, camel].filter((k) => out[k] !== undefined && out[k] !== null);
        for (const k of candidates) {
            const v = out[k];
            // skip if already hashed (starts with $2)
            if (typeof v === 'string' && v.startsWith('$2')) continue;
            // eslint-disable-next-line no-await-in-loop
            out[k] = await bcrypt.hash(v, BCRYPT_COST);
        }
    }
    return out;
}

/** Build a V1-compat model for a Drizzle table. */
function makeModel(table, options = {}) {
    const opts = {
        fieldMap: options.fieldMap || {},
        hashFields: options.hashFields || [],   // snake_case column names to hash on save
        secretFields: options.secretFields || [], // snake_case column names to strip from toJSON
        roleFilter: options.roleFilter || null,   // for User facades (admin/trainer/hod)
        select: options.select !== undefined ? options.select : true,
    };

    function applyRoleFilter(filter) {
        if (!opts.roleFilter) return filter || {};
        return { ...(filter || {}), role: opts.roleFilter };
    }

    function applyRoleOnInsert(values) {
        if (!opts.roleFilter) return values;
        return { role: opts.roleFilter, ...values };
    }

    function withSecretStrip(doc) {
        if (!doc) return null;
        return rowToDoc(doc, opts);
    }

    const model = {
        // --- query: many ---
        async find(filter, projection, queryOpts) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            let q = db.select().from(table);
            if (where) q = q.where(where);
            if (queryOpts && queryOpts.sort) {
                for (const [k, dir] of Object.entries(queryOpts.sort)) {
                    const col = resolveCol(table, k, opts.fieldMap);
                    if (col) q = q.orderBy(dir === -1 ? desc(col) : asc(col));
                }
            }
            if (queryOpts && queryOpts.limit) q = q.limit(queryOpts.limit);
            const rows = await q;
            const docs = rows.map(withSecretStrip);
            return attachChainHelpers(docs, table, opts);
        },

        async findOne(filter, projection, queryOpts) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            let q = db.select().from(table);
            if (where) q = q.where(where);
            q = q.limit(1);
            const rows = await q;
            return rows[0] ? attachInstanceHelpers(withSecretStrip(rows[0]), table, opts) : null;
        },

        async findById(id) {
            if (!id) return null;
            const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
            return rows[0] ? attachInstanceHelpers(withSecretStrip(rows[0]), table, opts) : null;
        },

        async findByIdAndUpdate(id, update, updateOpts) {
            if (!id) return null;
            const set = buildUpdate(table, update, opts.fieldMap);
            const hashed = await hashPasswordFields(set, opts.hashFields, opts.fieldMap);
            const rows = await db.update(table).set(hashed).where(eq(table.id, id)).returning();
            return rows[0] ? attachInstanceHelpers(withSecretStrip(rows[0]), table, opts) : null;
        },

        async findByIdAndDelete(id) {
            if (!id) return null;
            const rows = await db.delete(table).where(eq(table.id, id)).returning();
            return rows[0] ? withSecretStrip(rows[0]) : null;
        },

        async findOneAndUpdate(filter, update, updateOpts) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            if (!where) return null;
            const set = buildUpdate(table, update, opts.fieldMap);
            const hashed = await hashPasswordFields(set, opts.hashFields, opts.fieldMap);
            const rows = await db.update(table).set(hashed).where(where).returning();
            return rows[0] ? attachInstanceHelpers(withSecretStrip(rows[0]), table, opts) : null;
        },

        async findOneAndDelete(filter) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            if (!where) return null;
            const rows = await db.delete(table).where(where).returning();
            return rows[0] ? withSecretStrip(rows[0]) : null;
        },

        async create(values) {
            // Accept either a single object or an array
            if (Array.isArray(values)) {
                const out = [];
                for (const v of values) out.push(await model.create(v));
                return out;
            }
            const enriched = applyRoleOnInsert(values);
            const insertVals = buildInsertValues(table, enriched, opts.fieldMap);
            const hashed = await hashPasswordFields(insertVals, opts.hashFields, opts.fieldMap);
            const rows = await db.insert(table).values(hashed).returning();
            return rows[0] ? attachInstanceHelpers(withSecretStrip(rows[0]), table, opts) : null;
        },

        async insertMany(values) { return model.create(values); },

        async countDocuments(filter) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            let q = db.select({ c: sql`count(*)` }).from(table);
            if (where) q = q.where(where);
            const rows = await q;
            return Number(rows[0]?.c || 0);
        },

        async updateOne(filter, update) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            if (!where) return { matchedCount: 0, modifiedCount: 0 };
            const set = buildUpdate(table, update, opts.fieldMap);
            const hashed = await hashPasswordFields(set, opts.hashFields, opts.fieldMap);
            const rows = await db.update(table).set(hashed).where(where).returning();
            return { matchedCount: rows.length, modifiedCount: rows.length, acknowledged: true };
        },

        async updateMany(filter, update) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            if (!where) return { matchedCount: 0, modifiedCount: 0 };
            const set = buildUpdate(table, update, opts.fieldMap);
            const hashed = await hashPasswordFields(set, opts.hashFields, opts.fieldMap);
            const rows = await db.update(table).set(hashed).where(where).returning();
            return { matchedCount: rows.length, modifiedCount: rows.length, acknowledged: true };
        },

        async deleteOne(filter) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            if (!where) return { deletedCount: 0 };
            const rows = await db.delete(table).where(where).returning();
            return { deletedCount: rows.length, acknowledged: true };
        },

        async deleteMany(filter) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            if (!where) return { deletedCount: 0 };
            const rows = await db.delete(table).where(where).returning();
            return { deletedCount: rows.length, acknowledged: true };
        },

        async distinct(field, filter) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            const col = resolveCol(table, field, opts.fieldMap);
            if (!col) return [];
            let q = db.selectDistinct({ v: col }).from(table);
            if (where) q = q.where(where);
            const rows = await q;
            return rows.map((r) => r.v);
        },

        async exists(filter) {
            const where = buildWhere(table, applyRoleFilter(filter), opts.fieldMap);
            let q = db.select({ id: table.id }).from(table);
            if (where) q = q.where(where);
            q = q.limit(1);
            const rows = await q;
            return rows[0] ? { _id: rows[0].id } : null;
        },

        // V1 constructor pattern: new Model(...).save()
        // Returns a "draft" object whose save() inserts and returns the persisted doc.
        ctor(values) {
            const draft = { ...values };
            draft.save = async function () {
                const created = await model.create(this);
                Object.assign(this, created);
                return this;
            };
            draft.toJSON = function () {
                const out = { ...this };
                delete out.save;
                delete out.toJSON;
                delete out.comparePassword;
                return out;
            };
            return draft;
        },

        // V1-style aggregate — unsupported; returns empty for compatibility.
        async aggregate() {
            console.warn('[models shim] aggregate() is not implemented in Phase 1b; returning []');
            return [];
        },

        // ---- direct table escape hatches ----
        _table: table,
        _db: db,
    };

    // V1 callers chain `.select('+password')`, `.sort({...})`, etc. on the
    // result of these query methods. Wrap each to return a V1-style
    // thenable so chained calls + await both keep working.
    ['find', 'findOne', 'findById', 'findOneAndUpdate', 'findByIdAndUpdate', 'findOneAndDelete', 'findByIdAndDelete'].forEach((name) => {
        const orig = model[name];
        model[name] = function (...args) {
            return makeQueryThenable(orig.apply(model, args));
        };
    });

    return model;
}

/** Attach .toJSON / .save helpers to a single hydrated doc. */
function attachInstanceHelpers(doc, table, opts) {
    if (!doc) return doc;
    doc.save = async function () {
        const update = { ...this };
        delete update.save;
        delete update.toJSON;
        delete update.comparePassword;
        delete update._id;
        delete update.id;
        const set = buildUpdate(table, update, opts.fieldMap);
        const hashed = await hashPasswordFields(set, opts.hashFields, opts.fieldMap);
        const rows = await db.update(table).set(hashed).where(eq(table.id, this.id)).returning();
        if (rows[0]) Object.assign(this, rowToDoc(rows[0], opts));
        return this;
    };
    doc.toJSON = function () {
        const out = { ...this };
        delete out.save;
        delete out.toJSON;
        delete out.comparePassword;
        return out;
    };
    return doc;
}

/** Attach .sort/.limit/.skip chain helpers to an array result for callers that chain after find(). */
function attachChainHelpers(arr, table, opts) {
    // V1 sometimes does `await Model.find(...).sort({...}).limit(...)` — we already executed.
    // Best-effort: return a proxy that ignores chain calls (compatibility).
    arr.sort = function () { return arr; };
    arr.limit = function () { return arr; };
    arr.skip = function () { return arr; };
    arr.lean = function () { return arr; };
    arr.populate = function () { return arr; };
    return arr;
}

/**
 * Wrap a Promise in a V1-style "Query" thenable. V1 frequently chains
 * `Model.findOne({...}).select('+password')` etc.; Drizzle returns all columns
 * by default so .select() is a no-op. The wrapper is also awaitable, so any
 * caller doing `await Model.findOne(...)` keeps working transparently.
 */
function makeQueryThenable(promise) {
    const self = {
        // V1-style chainable no-ops (we already pull all fields from Postgres)
        select:   () => self,
        sort:     () => self,
        limit:    () => self,
        skip:     () => self,
        lean:     () => self,
        populate: () => self,
        exec:     () => promise,
        // thenable surface — makes `await query` work
        then:    (onResolved, onRejected) => promise.then(onResolved, onRejected),
        catch:   (onRejected) => promise.catch(onRejected),
        finally: (onFinally) => promise.finally(onFinally),
    };
    return self;
}

// ============================================================================
// MODELS — back V1 model names with the shim
// ============================================================================
const usersOpts = {
    hashFields: ['password'],
    secretFields: ['password'],
    fieldMap: {
        isActive: 'is_active',
        isFirstLogin: 'is_first_login',
        mustUpdateEmail: 'must_update_email',
        mustUpdatePassword: 'must_update_password',
        emailVerified: 'email_verified',
        loginAttempts: 'login_attempts',
        lastLogin: 'last_login',
        lastPasswordChange: 'last_password_change',
        tokenVersion: 'token_version',
        staffId: 'staff_id',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
};

const studentOpts = {
    hashFields: ['password'],
    secretFields: ['password'],
    fieldMap: {
        idNumber: 'id_number',
        kcseGrade: 'kcse_grade',
        admissionNumber: 'admission_number',
        intakeYear: 'intake_year',
        phoneNumber: 'phone_number',
        admissionType: 'admission_type',
        nextOfKinName: 'next_of_kin_name',
        nextOfKinPhone: 'next_of_kin_phone',
        module: 'module',
        tokenVersion: 'token_version',
        isFirstLogin: 'is_first_login',
        mustUpdatePassword: 'must_update_password',
        isActive: 'is_active',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
};

const Student = makeModel(schema.students, studentOpts);

// Unified users — three role-filtered facades
const AdminStaff = makeModel(schema.users, { ...usersOpts, roleFilter: 'admin' });
const Trainer    = makeModel(schema.users, { ...usersOpts, roleFilter: 'trainer' });
const HOD        = makeModel(schema.users, { ...usersOpts, roleFilter: 'hod' });
const User       = makeModel(schema.users, usersOpts); // unfiltered (login looks up any role)

// Plain tables
const Program                  = makeModel(schema.programs, { fieldMap: { programName: 'name', programCost: 'program_cost', departmentId: 'department_id', durationYears: 'duration_years', isActive: 'is_active' } });
const Unit                     = makeModel(schema.units, { fieldMap: { programId: 'program_id', isCommon: 'is_common' } });
const CommonUnit               = makeModel(schema.units, { fieldMap: { programId: 'program_id', isCommon: 'is_common' } }); // V1 had separate "common" model; map onto units
const CommonUnitAssignment     = makeModel(schema.commonUnitAssignments, { fieldMap: { commonUnitId: 'unit_id', unitId: 'unit_id', programId: 'program_id', trainerId: 'trainer_id', assignedBy: 'assigned_by', assignedByDepartment: 'assigned_by_department', trainerDepartment: 'trainer_department' } });
const TrainerAssignment        = makeModel(schema.trainerAssignments, { fieldMap: { trainerId: 'trainer_id', unitId: 'unit_id', academicYear: 'academic_year' } });
const StudentUnitRegistration  = makeModel(schema.unitRegistrations, { fieldMap: { studentId: 'student_id', unitId: 'unit_id', academicYear: 'academic_year' } });
const ToolRequest              = makeModel(schema.toolRequests, { fieldMap: { toolType: 'tool_type', targetType: 'target_type', targetTrainerId: 'target_trainer_id', targetDepartment: 'target_department', dueDate: 'due_date', requestedBy: 'requested_by' } });
const ToolUpload               = makeModel(schema.toolUploads, { fieldMap: { requestId: 'request_id', trainerId: 'trainer_id', toolType: 'tool_type', fileName: 'file_name', originalName: 'original_name', s3Key: 's3_key', s3Bucket: 's3_bucket', fileSize: 'file_size', mimeType: 'mime_type', reviewedBy: 'reviewed_by', reviewedAt: 'reviewed_at' } });
const AttachmentApplication    = makeModel(schema.attachmentApplications, { fieldMap: { studentId: 'student_id', companyName: 'company_name', startDate: 'start_date', endDate: 'end_date', nearestTown: 'nearest_town', reviewedBy: 'reviewed_by', reviewedAt: 'reviewed_at' } });
const GraduationApplication    = makeModel(schema.graduationApplications, { fieldMap: { studentId: 'student_id', appliedAt: 'applied_at', approvedAt: 'approved_at', approvedBy: 'approved_by', reviewedBy: 'reviewed_by', reviewedAt: 'reviewed_at' } });
const Notification             = makeModel(schema.notifications, { fieldMap: { recipientId: 'recipient_id', recipientType: 'recipient_type', isRead: 'is_read' } });
const StudentNote              = makeModel(schema.studentNotes, { fieldMap: { studentId: 'student_id', authorId: 'author_id' } });
const StudentUpload            = makeModel(schema.studentUploads, { fieldMap: { studentId: 'student_id', fileName: 'file_name', filePath: 'file_path', fileSize: 'file_size', mimeType: 'mime_type', uploadedBy: 'uploaded_by', uploadedAt: 'uploaded_at' } });
const AuditLog                 = makeModel(schema.auditLogs, { fieldMap: { actorId: 'actor_id', actorType: 'actor_type', resourceType: 'resource_type', resourceId: 'resource_id', ipAddress: 'ip_address', userAgent: 'user_agent' } });
const SystemSettings           = makeModel(schema.systemSettings, { fieldMap: { updatedBy: 'updated_by' } });
const PasswordReset            = makeModel(schema.passwordResets, { fieldMap: { tokenHash: 'token_hash', expiresAt: 'expires_at', usedAt: 'used_at', userId: 'user_id', userRole: 'user_role', resetType: 'reset_type' } });
const LoginOTP                 = makeModel(schema.loginOtps, { fieldMap: { codeHash: 'code_hash', expiresAt: 'expires_at', usedAt: 'used_at' } });
const Payment                  = makeModel(schema.payments, { fieldMap: { studentId: 'student_id', paymentMode: 'payment_mode', bankName: 'bank_name', paymentDate: 'payment_date', referenceNumber: 'reference_number', reference: 'reference_number', recordedBy: 'recorded_by' } });
const Payslip                  = makeModel(schema.payslips, { fieldMap: { trainerId: 'trainer_id', grossPay: 'gross_pay', netPay: 'net_pay', paymentDate: 'payment_date' } });

// ============================================================================
// CUSTOM STATIC METHODS — V1 models exposed bespoke helpers (getSetting,
// registerStudent, ...) that the generic CRUD shim does not provide. Implement
// them directly against Drizzle so the call sites keep working.
// ============================================================================

// ---- SystemSettings: key/value config helpers (value column is jsonb) ----
SystemSettings.getSetting = async function getSetting(key, defaultValue = null) {
    const rows = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, key)).limit(1);
    if (!rows.length) return defaultValue;
    const v = rows[0].value;
    return (v === null || v === undefined) ? defaultValue : v;
};

SystemSettings.setSetting = async function setSetting(key, value, description, updatedBy = null) {
    const rows = await db.insert(schema.systemSettings)
        .values({ key, value, updated_by: updatedBy, updated_at: new Date() })
        .onConflictDoUpdate({
            target: schema.systemSettings.key,
            set: { value, updated_by: updatedBy, updated_at: new Date() },
        })
        .returning();
    return rows[0] ? rowToDoc(rows[0], {}) : null;
};

SystemSettings.getSettingsByCategory = async function getSettingsByCategory() {
    // The V2 schema has no category column; return every setting (matches the
    // un-categorised GET /system-settings behaviour).
    const rows = await db.select().from(schema.systemSettings);
    return rows.map((r) => rowToDoc(r, {}));
};

// ---- StudentUnitRegistration: V1 helpers over the unit_registrations table ----
// The table is lean (student_id, unit_id, academic_year:int, semester:int) and
// has no denormalised course/unit code or status columns, so these helpers join
// units for display and treat every persisted row as a 'registered' unit.
function _toYearInt(academicYear) {
    if (academicYear === null || academicYear === undefined) {
        return require('../utils/academicPeriod').getCurrentAcademicYearStart();
    }
    const n = parseInt(String(academicYear).split('/')[0], 10);
    return Number.isFinite(n) ? n : require('../utils/academicPeriod').getCurrentAcademicYearStart();
}

async function _resolveStudentId(studentIdOrAdmission) {
    if (!studentIdOrAdmission) return null;
    const val = String(studentIdOrAdmission);
    // A UUID is used directly; anything else is treated as an admission number.
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)) {
        return val;
    }
    const rows = await db.select({ id: schema.students.id }).from(schema.students)
        .where(eq(schema.students.admission_number, val)).limit(1);
    return rows[0]?.id || null;
}

StudentUnitRegistration.getStudentRegistrations = async function getStudentRegistrations(studentIdOrAdmission, status = 'registered') {
    const studentId = await _resolveStudentId(studentIdOrAdmission);
    if (!studentId) return [];
    const rows = await db
        .select({
            id: schema.unitRegistrations.id,
            unitId: schema.unitRegistrations.unit_id,
            academicYear: schema.unitRegistrations.academic_year,
            semester: schema.unitRegistrations.semester,
            registeredAt: schema.unitRegistrations.registered_at,
            unitCode: schema.units.code,
            unitName: schema.units.name,
            isCommon: schema.units.is_common,
        })
        .from(schema.unitRegistrations)
        .leftJoin(schema.units, eq(schema.unitRegistrations.unit_id, schema.units.id))
        .where(eq(schema.unitRegistrations.student_id, studentId));
    return rows.map((r) => ({
        _id: r.id,
        id: r.id,
        unitId: r.unitId,
        unitCode: r.unitCode,
        unitName: r.unitName,
        unitType: r.isCommon ? 'common' : 'department',
        academicYear: r.academicYear,
        semester: r.semester,
        status: 'registered',
        registeredAt: r.registeredAt,
    }));
};

StudentUnitRegistration.registerStudent = async function registerStudent(data) {
    const studentId = await _resolveStudentId(data.studentId);
    if (!studentId) throw new Error('Student not found for registration');
    if (!data.unitId) throw new Error('unitId is required for registration');
    const academicYear = _toYearInt(data.academicYear);
    const semester = Number.isFinite(parseInt(data.semester, 10)) ? parseInt(data.semester, 10) : 1;

    // Idempotent: do not double-register the same unit for the same period.
    const existing = await db.select({ id: schema.unitRegistrations.id })
        .from(schema.unitRegistrations)
        .where(and(
            eq(schema.unitRegistrations.student_id, studentId),
            eq(schema.unitRegistrations.unit_id, data.unitId),
            eq(schema.unitRegistrations.academic_year, academicYear),
            eq(schema.unitRegistrations.semester, semester),
        )).limit(1);
    if (existing.length) {
        return { _id: existing[0].id, id: existing[0].id, unitId: data.unitId, academicYear, semester, status: 'registered', alreadyRegistered: true };
    }

    const rows = await db.insert(schema.unitRegistrations)
        .values({ student_id: studentId, unit_id: data.unitId, academic_year: academicYear, semester })
        .returning();
    const r = rows[0];
    return { _id: r.id, id: r.id, unitId: r.unit_id, academicYear: r.academic_year, semester: r.semester, status: 'registered' };
};

// ---- AuditLog: best-effort action logger ----
// V1 exposed AuditLog.logAction(payload). The payload mixes real uuid columns
// (userId, fileId) with non-uuid identifiers (studentId is often an admission
// number like "AC6/0001/S25"), so we fold the non-column identifiers into the
// jsonb `details` and ONLY put genuine uuids into uuid columns. Logging must
// NEVER throw or 500 the calling route — every failure is swallowed.
const _UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const _isUuid = (v) => typeof v === 'string' && _UUID_RE.test(v);

AuditLog.logAction = async function logAction(payload = {}) {
    try {
        if (!payload || !payload.action) return null; // action is NOT NULL
        const fileIdIsUuid = _isUuid(payload.fileId);
        const values = {
            actor_id: _isUuid(payload.userId) ? payload.userId : null,
            actor_type: payload.userType || null,
            action: payload.action,
            // fileId => student_upload; otherwise a studentId implies a student.
            resource_type: payload.fileId ? 'student_upload' : (payload.studentId ? 'student' : null),
            // resource_id is a uuid column — NEVER store an admission number here.
            resource_id: fileIdIsUuid ? payload.fileId : null,
            // Non-column identifiers live in details.
            details: { ...(payload.details || {}), studentId: payload.studentId, fileId: payload.fileId },
            ip_address: payload.ipAddress || null,
            user_agent: payload.userAgent || null,
        };
        const rows = await db.insert(schema.auditLogs).values(values).returning();
        return rows[0] ? rowToDoc(rows[0], {}) : null;
    } catch (err) {
        console.error('AuditLog.logAction failed (non-fatal):', err.message);
        return null;
    }
};

// ---- StudentUpload: CIBEC filtered listing over the student_uploads table ----
// Builds a Drizzle WHERE from only the filters that map to real columns; unknown
// filters are ignored. Returns an array and never throws.
StudentUpload.getCIBECUploads = async function getCIBECUploads(filters = {}) {
    try {
        const u = schema.studentUploads;
        const conds = [];
        const eqText = (col, val) => { if (val !== undefined && val !== null && val !== '') conds.push(eq(col, val)); };
        const eqInt = (col, val) => {
            if (val === undefined || val === null || val === '') return;
            const n = parseInt(String(val).split('/')[0], 10);
            if (Number.isFinite(n)) conds.push(eq(col, n));
        };
        eqText(u.course, filters.course);
        eqText(u.department, filters.department);
        eqText(u.unit_code, filters.unitCode);
        eqInt(u.module, filters.module);
        eqText(u.upload_type, filters.uploadType);
        eqInt(u.academic_year, filters.academicYear);
        eqInt(u.semester, filters.semester);
        eqText(u.status, filters.status);
        eqText(u.admission_number, filters.admissionNumber);
        eqText(u.intake, filters.intake);
        eqInt(u.intake_year, filters.intakeYear);
        if (filters.studentId) {
            const val = String(filters.studentId).trim();
            if (_isUuid(val)) {
                conds.push(eq(u.student_id, val));
            } else {
                // The search box accepts an admission number OR a (partial) name.
                // Match either column case-insensitively so "jane" finds the
                // student and a partial admission number still narrows results.
                const like = `%${val}%`;
                conds.push(or(ilike(u.admission_number, like), ilike(u.student_name, like)));
            }
        }
        // NOTE: `courseLevel` has no column on student_uploads — ignored.
        // TODO: derive level (e.g. join programs) if CIBEC needs level filtering.
        let q = db.select().from(u);
        if (conds.length) q = q.where(conds.length === 1 ? conds[0] : and(...conds));
        q = q.orderBy(desc(u.uploaded_at));
        const rows = await q;
        return rows.map((r) => rowToDoc(r, {}));
    } catch (err) {
        console.error('StudentUpload.getCIBECUploads failed:', err.message);
        return [];
    }
};

// CIBEC statistics use aggregation pipelines the shim doesn't translate.
// TODO: implement $match/$group aggregation (e.g. GROUP BY upload_type/department/course).
StudentUpload.aggregate = async function aggregate() { return []; };

// ---- StudentNote: notes for a student, newest first ----
// studentIdOrAdmission may be an admission number ("AC6/0001/S25"); resolve it
// to the student uuid before querying the student_id uuid column. Optionally
// filters by note_type. Returns [] (never throws) when the student isn't found.
StudentNote.getStudentNotes = async function getStudentNotes(studentIdOrAdmission, noteType) {
    const studentId = await _resolveStudentId(studentIdOrAdmission);
    if (!studentId) return [];
    const conds = [eq(schema.studentNotes.student_id, studentId)];
    if (noteType) conds.push(eq(schema.studentNotes.note_type, noteType));
    const rows = await db.select().from(schema.studentNotes)
        .where(conds.length === 1 ? conds[0] : and(...conds))
        .orderBy(desc(schema.studentNotes.created_at));
    // rowToDoc → camelCase + _id; carries note, noteType, title, category,
    // priority, createdAt, authorId, studentName, admissionNumber.
    return rows.map((r) => rowToDoc(r, {}));
};

// ---- PasswordReset: hashed OTP / reset-token flow ----
// SECURITY: the raw OTP / reset token is NEVER stored. We persist only its
// SHA-256 hash in token_hash (V1 stored raw values — deliberately NOT preserved).
const MAX_OTP_ATTEMPTS = 5;

function hashValue(v) {
    return crypto.createHash('sha256').update(String(v)).digest('hex');
}

// Constant-time compare of a raw secret against a stored hex hash.
function compareHash(raw, storedHash) {
    if (!raw || !storedHash) return false;
    const supplied = hashValue(raw);
    if (supplied.length !== String(storedHash).length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(String(storedHash), 'hex'));
    } catch (_) {
        return false;
    }
}

PasswordReset.hashValue = hashValue;
PasswordReset.compareHash = compareHash;
PasswordReset.generateOTP = function generateOTP() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
};
PasswordReset.generateResetToken = function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
};

// Attach the per-row instance helpers the route relies on. markAsUsed /
// incrementAttempts write directly by id (we never call the generic .save() on
// a reset doc, which would try to persist these function props as columns).
function _attachResetMethods(doc) {
    if (!doc) return null;
    doc.canAttempt = function () { return Number(this.attempts || 0) < MAX_OTP_ATTEMPTS; };
    doc.markAsUsed = async function () {
        await db.update(schema.passwordResets)
            .set({ used_at: new Date(), updated_at: new Date() })
            .where(eq(schema.passwordResets.id, this.id));
        this.usedAt = new Date();
        return this;
    };
    doc.incrementAttempts = async function () {
        const rows = await db.update(schema.passwordResets)
            .set({ attempts: sql`${schema.passwordResets.attempts} + 1`, updated_at: new Date() })
            .where(eq(schema.passwordResets.id, this.id))
            .returning({ attempts: schema.passwordResets.attempts });
        this.attempts = rows[0] ? rows[0].attempts : Number(this.attempts || 0) + 1;
        return this.attempts;
    };
    return doc;
}

async function _hydrateReset(id) {
    const doc = await PasswordReset.findById(id); // hydrated doc (camelCase + _id)
    return _attachResetMethods(doc);
}

// Mark every still-active reset for a user as used (used_at = now()).
PasswordReset.invalidateUserResets = async function invalidateUserResets(userId, userRole) {
    if (!userId) return 0;
    const conds = [eq(schema.passwordResets.user_id, userId), isNull(schema.passwordResets.used_at)];
    if (userRole) conds.push(eq(schema.passwordResets.user_role, userRole));
    const rows = await db.update(schema.passwordResets)
        .set({ used_at: new Date(), updated_at: new Date() })
        .where(and(...conds))
        .returning({ id: schema.passwordResets.id });
    return rows.length;
};

// Find a row by HASHED secret — used for the token (email-link / session) path.
// Returns null unless the hash matches an unused, unexpired row of the right
// role + reset_type. (A wrong/forged secret simply won't match — see the
// verify-otp route for OTP attempt counting, which can't key on the hash.)
PasswordReset.findValidReset = async function findValidReset({ email, userRole, resetType, otp, token } = {}) {
    const secret = otp || token;
    if (!secret || !userRole || !resetType) return null;
    const conds = [
        eq(schema.passwordResets.token_hash, hashValue(secret)),
        eq(schema.passwordResets.user_role, userRole),
        eq(schema.passwordResets.reset_type, resetType),
        isNull(schema.passwordResets.used_at),
        gt(schema.passwordResets.expires_at, sql`NOW()`),
    ];
    if (email) conds.push(eq(schema.passwordResets.email, String(email).toLowerCase()));
    const rows = await db.select({ id: schema.passwordResets.id })
        .from(schema.passwordResets)
        .where(and(...conds))
        .limit(1);
    if (!rows.length) return null;
    return _hydrateReset(rows[0].id);
};

// Find the newest still-active OTP row for an email+role WITHOUT matching the
// code, so verify-otp can compare the hash itself and increment attempts on a
// wrong guess (a hash-keyed lookup can't find the row on a miss).
PasswordReset.findOtpRequest = async function findOtpRequest({ email, userRole } = {}) {
    if (!email || !userRole) return null;
    const rows = await db.select({ id: schema.passwordResets.id })
        .from(schema.passwordResets)
        .where(and(
            eq(schema.passwordResets.email, String(email).toLowerCase()),
            eq(schema.passwordResets.user_role, userRole),
            eq(schema.passwordResets.reset_type, 'otp'),
            isNull(schema.passwordResets.used_at),
            gt(schema.passwordResets.expires_at, sql`NOW()`),
        ))
        .orderBy(desc(schema.passwordResets.created_at))
        .limit(1);
    if (!rows.length) return null;
    return _hydrateReset(rows[0].id);
};

module.exports = {
    // Shim factory + helpers (escape hatch for advanced callers)
    makeModel, buildWhere, buildUpdate, buildInsertValues, rowToDoc,

    // V1 model facades
    Student,
    User,
    AdminStaff, Trainer, HOD,
    Program, Unit, CommonUnit, CommonUnitAssignment,
    TrainerAssignment, StudentUnitRegistration,
    ToolRequest, ToolUpload,
    AttachmentApplication, GraduationApplication,
    Notification, StudentNote, StudentUpload,
    AuditLog, SystemSettings, PasswordReset, LoginOTP,
    Payment, Payslip,
};
