const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership, signToken, setAuthCookie, setCsrfCookie, generateCsrfToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { toMoneyNumber } = require('../utils/formatters');
const { extractLevelFromCourse, getMaxModuleForLevel } = require('../utils/studentHelpers');
const { getCourseCode, getCourseDisplayName, getDepartmentDisplayName } = require('../utils/courseCodes');
const { Student, Program } = require('../db/models');

// Resolve the program (and its cost) for a student's course key. The programs
// table and the course-code config historically disagree on short codes
// (e.g. course "applied_biology_6" → config code "AP6" but the seeded program
// is "AB6"), so match on the canonical display NAME first and fall back to the
// code. This makes program cost reliable for both seeded (short-code) and
// registrar-admitted (long-key) students. Returns { programCost, programName }.
async function resolveProgramForCourse(course) {
    if (!course) return { programCost: null, programName: null };
    const name = getCourseDisplayName(course);
    let program = name ? await Program.findOne({ programName: name }) : null;
    if (!program) {
        const code = getCourseCode(course);
        if (code) program = await Program.findOne({ code });
    }
    return {
        programCost: program ? toMoneyNumber(program.programCost) : null,
        programName: program ? program.name : null,
    };
}

// Get Student Data by Admission Number
router.get('/students/admission/:admissionNumber', verifyToken, authorize('admin', 'registrar', 'finance', 'student'), verifyOwnership('admissionNumber', ['finance']), async (req, res) => {
    try {
        const { admissionNumber } = req.params;
        console.log('Fetching student data for admission number:', admissionNumber);

        const student = await Student.findOne({ admissionNumber }).select('-password');

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        console.log('Found student:', student.name);

        // Enrich with server-resolved program cost + human-readable labels so the
        // student portal (dashboard + financial tab) can show Total Program Cost
        // and program details on first paint without a fragile client-side
        // course→program guess.
        const { programCost, programName } = await resolveProgramForCourse(student.course);
        const out = (typeof student.toJSON === 'function') ? student.toJSON() : { ...student };
        out.courseName = getCourseDisplayName(student.course);
        out.courseCode = getCourseCode(student.course) || student.course;
        out.departmentName = getDepartmentDisplayName(student.department);
        out.programCost = programCost;
        out.programName = programName;
        res.json(out);

    } catch (error) {
        console.error('Error fetching student data:', error);
        res.status(500).json({ message: 'Error fetching student data' });
    }
});

// Login Endpoint
router.post('/students/login', authLimiter, async (req, res) => {
    try {
        const { admissionNumber, password } = req.body;

        if (!admissionNumber || !password) {
            return res.status(400).json({ message: 'Please provide both admission number and password' });
        }

        // Use one generic message for both "no such admission number" and "wrong password"
        // to prevent user enumeration. Do NOT log the password or the matched phone number.
        const genericFail = { message: 'Invalid admission number or password' };

        // SEV-H-018: password is select:false; load it for comparePassword.
        const student = await Student.findOne({ admissionNumber: String(admissionNumber) }).select('+password');
        if (!student) {
            return res.status(401).json(genericFail);
        }

        // SEV-H-014 transition: new students have a strong random password
        // (compared as-is). Existing students still have the legacy phone-number
        // password until the follow-up migration runs, so fall back to the
        // canonical Kenyan phone normalisation if the raw value does not match.
        let isValid = await student.comparePassword(String(password));
        if (!isValid) {
            const digits = String(password).replace(/\D/g, '');
            let candidate;
            if (digits.length === 9 && digits[0] === '7') {
                candidate = '0' + digits;
            } else if (digits.length === 10 && digits[0] === '0') {
                candidate = digits;
            } else if (digits.length === 12 && digits.startsWith('254')) {
                candidate = '0' + digits.slice(3);
            } else {
                candidate = digits;
            }
            isValid = await student.comparePassword(candidate);
        }
        if (!isValid) {
            return res.status(401).json(genericFail);
        }

        const firstLoginRequired = !!student.mustUpdatePassword;

        // Issue a JWT so subsequent API calls can be authenticated and authorised.
        const token = signToken({
            userId: String(student._id),
            email: student.email || null,
            role: 'student',
            admissionNumber: student.admissionNumber,
            tokenVersion: student.tokenVersion || 0, // SEV-H-013
            firstLoginRequired // SEV-H-014: gates all routes except the password-change endpoint
        });

        setAuthCookie(res, token, 'student');
        setCsrfCookie(res, generateCsrfToken());
        res.status(200).json({
            message: 'Login successful',
            token,
            firstLoginRequired,
            user: {
                id: student._id,
                name: student.name,
                admissionNumber: student.admissionNumber,
                course: student.course,
                department: student.department,
                module: student.module
            }
        });
    } catch (error) {
        console.error('Student login error:', error.message);
        res.status(500).json({ message: 'Error during login' });
    }
});

// SEV-H-014: forced first-login password change. The enforceStudentFirstLogin
// guard only lets a flagged student reach this route. Verifies the old
// password, enforces complexity, clears the flag, bumps tokenVersion (the
// pre-save hook does this) and returns a fresh token.
router.post('/students/:studentId/first-login-password-change', verifyToken, authorize('student'), async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: 'oldPassword and newPassword are required' });
        }

        const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!complexity.test(newPassword)) {
            return res.status(400).json({
                message: 'New password must be at least 8 characters and include an uppercase letter, a lowercase letter, a digit and a special character.'
            });
        }

        // SEV-H-018: password is select:false; load it for comparePassword.
        const student = await Student.findById(req.user.userId).select('+password');
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const ok = await student.comparePassword(String(oldPassword));
        if (!ok) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }
        if (String(newPassword) === String(oldPassword)) {
            return res.status(400).json({ message: 'New password must be different from the current password' });
        }

        student.password = String(newPassword); // pre-save hook hashes + bumps tokenVersion
        student.mustUpdatePassword = false;
        student.isFirstLogin = false;
        await student.save();

        const token = signToken({
            userId: String(student._id),
            email: student.email || null,
            role: 'student',
            admissionNumber: student.admissionNumber,
            tokenVersion: student.tokenVersion || 0,
            firstLoginRequired: false
        });

        // save() bumped tokenVersion, so the old cookie is now invalid — re-set
        // the auth cookie with the fresh token so the portal loads cleanly.
        setAuthCookie(res, token, 'student');
        setCsrfCookie(res, generateCsrfToken());

        res.json({
            success: true,
            message: 'Password updated successfully',
            token
        });
    } catch (error) {
        console.error('Student first-login password change error:', error.message);
        res.status(500).json({ message: 'Error updating password' });
    }
});

// Get Student by id (used by registrar view/edit)
router.get('/students/:id', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('id'), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id, { password: 0 });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.json(student);
    } catch (error) {
        console.error('Error fetching student by id:', error);
        res.status(500).json({ message: 'Error fetching student' });
    }
});

// Update Student by id
router.put('/students/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { name, idNumber, phoneNumber, module: moduleField, nextOfKinName, nextOfKinPhone } = req.body;

        // Validate phone number format if provided
        if (phoneNumber) {
            const normalizedPhone = phoneNumber.replace(/\D/g, '');
            if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(normalizedPhone)) {
                return res.status(400).json({
                    message: 'Invalid phone number format. Please enter a valid Kenyan phone number'
                });
            }
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (idNumber) updateData.idNumber = idNumber;
        if (phoneNumber) {
            const normalizedPhone = phoneNumber.replace(/\D/g, '');
            const formattedPhone = normalizedPhone.length === 12 ? '0' + normalizedPhone.slice(-9) :
                                  normalizedPhone.length === 13 ? '0' + normalizedPhone.slice(-9) :
                                  normalizedPhone;
            updateData.phoneNumber = formattedPhone;
        }
        if (nextOfKinName !== undefined) updateData.nextOfKinName = nextOfKinName ? String(nextOfKinName).trim() : null;
        if (nextOfKinPhone !== undefined) {
            if (!nextOfKinPhone) {
                updateData.nextOfKinPhone = null;
            } else {
                const kinDigits = String(nextOfKinPhone).replace(/\D/g, '');
                if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(kinDigits)) {
                    return res.status(400).json({ message: 'Invalid next-of-kin phone number format.' });
                }
                updateData.nextOfKinPhone = kinDigits.length === 12 ? '0' + kinDigits.slice(-9) :
                                            kinDigits.length === 13 ? '0' + kinDigits.slice(-9) :
                                            kinDigits;
            }
        }

        // Handle module promotion with module-cap validation per level.
        if (moduleField !== undefined) {
            const currentStudent = await Student.findById(req.params.id);
            if (!currentStudent) {
                return res.status(404).json({ message: 'Student not found' });
            }
            const newModule = parseInt(moduleField, 10);
            if (!Number.isFinite(newModule) || newModule < 1) {
                return res.status(400).json({ message: 'Module must be a positive integer.' });
            }
            const level = extractLevelFromCourse(currentStudent.course);
            const cap = getMaxModuleForLevel(level);
            if (cap && newModule > cap) {
                return res.status(400).json({
                    message: `Cannot promote: Level ${level} students cap at module ${cap}.`,
                });
            }
            updateData.module = newModule;
            if (currentStudent.module !== newModule) {
                console.log(`Promotion: ${currentStudent.admissionNumber} module ${currentStudent.module} -> ${newModule}`);
            }
        }

        const student = await Student.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json({
            message: 'Student updated successfully',
            student
        });
    } catch (error) {
        console.error('Error updating student:', error);
        if (error.code === 11000 || error.code === '23505') {
            return res.status(400).json({ message: 'ID number, phone number, or email already exists' });
        }
        res.status(500).json({ message: 'Error updating student' });
    }
});

// Update student email
router.put('/students/:studentId/email', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { email } = req.body;

        console.log('Student email update request:', { studentId, newEmail: email });

        if (!email) {
            console.log('Email is missing in request body');
            return res.status(400).json({ message: 'Email is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('Invalid email format:', email);
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Check if email already exists
        const existingStudent = await Student.findOne({ email: email.toLowerCase(), admissionNumber: { $ne: studentId } });
        if (existingStudent) {
            console.log('Email already in use by another student:', existingStudent.admissionNumber);
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Update student email using admission number as identifier
        const student = await Student.findOneAndUpdate(
            { admissionNumber: studentId },
            { email: email.toLowerCase() },
            { new: true, runValidators: true }
        ).select('-password');

        if (!student) {
            console.log('Student not found:', studentId);
            return res.status(404).json({ message: 'Student not found' });
        }

        console.log('Student email updated successfully:', {
            admissionNumber: student.admissionNumber,
            newEmail: student.email
        });

        res.json({
            message: 'Email updated successfully',
            student: {
                admissionNumber: student.admissionNumber,
                name: student.name,
                email: student.email,
                phoneNumber: student.phoneNumber
            }
        });
    } catch (error) {
        console.error('Error updating student email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
