const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership, signToken, setAuthCookie, setCsrfCookie, generateCsrfToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { toMoneyNumber } = require('../utils/formatters');
const { Student, Program } = require('../db/models');

// Get Student Data by Admission Number
router.get('/students/admission/:admissionNumber', verifyToken, authorize('admin', 'registrar', 'finance', 'student'), verifyOwnership('admissionNumber'), async (req, res) => {
    try {
        const { admissionNumber } = req.params;
        console.log('Fetching student data for admission number:', admissionNumber);

        const student = await Student.findOne({ admissionNumber }).select('-password');

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        console.log('Found student:', student.name);
        res.json(student);

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

        setAuthCookie(res, token);
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
                year: student.year
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
        const { name, idNumber, phoneNumber, year } = req.body;

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

        // Handle year promotion with balance update
        if (year !== undefined) {
            updateData.year = year;

            // Get the current student to check if year is actually changing (promotion)
            const currentStudent = await Student.findById(req.params.id);

            if (currentStudent) {
                console.log(`Checking promotion: Current Year=${currentStudent.year}, New Year=${year}, Course=${currentStudent.course}`);

                if (currentStudent.year !== year) {
                    // Student is being promoted to a new year
                    console.log(`Student ${currentStudent.admissionNumber} is being promoted from Year ${currentStudent.year} to Year ${year}`);

                    // Map course code to program name
                    const courseToProgram = {
                        'applied_biology_6': 'Applied Biology Level 6',
                        'analytical_chemistry_6': 'Analytical Chemistry Level 6',
                        'science_lab_technology_5': 'Science Lab Technology Level 5',
                        'science_laboratory_technology_5': 'Science Lab Technology Level 5',
                        'general_agriculture_4': 'General Agriculture Level 4',
                        'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
                        'building_construction_4': 'Building Construction Level 4',
                        'building_construction_5': 'Building Construction Level 5',
                        'plumbing_4': 'Plumbing Level 4',
                        'plumbing_5': 'Plumbing Level 5',
                        'electrical_engineering_4': 'Electrical Engineering Level 4',
                        'electrical_engineering_5': 'Electrical Engineering Level 5',
                        'electrical_engineering_6': 'Electrical Engineering Level 6',
                        'automotive_engineering_5': 'Automotive Engineering Level 5',
                        'automotive_engineering_6': 'Automotive Engineering Level 6',
                        'hospitality_management_5': 'Hospitality Management Level 5',
                        'hospitality_management_6': 'Hospitality Management Level 6',
                        'food_beverage_production_management_5': 'Food & Beverage Production Management Level 5',
                        'food_beverage_production_management_6': 'Food & Beverage Production Management Level 6',
                        'business_management_6': 'Business Management Level 6',
                        'supply_chain_management_6': 'Supply Chain Management Level 6',
                        'human_resource_management_6': 'Human Resource Management Level 6',
                        'journalism_mass_communication_6': 'Journalism & Mass Communication Level 6',
                        'information_communication_technology_6': 'Information Communication Technology Level 6',
                        'information_technology_5': 'Information Technology Level 5',
                        'computer_science_6': 'Computer Science Level 6'
                    };

                    const programName = courseToProgram[currentStudent.course];
                    console.log(`Looking for program: ${programName} for course: ${currentStudent.course}`);

                    // Get the program cost for their course
                    const program = programName ? await Program.findOne({ programName }) : null;

                    if (program) {
                        const programCostNum = toMoneyNumber(program.programCost); // SEV-H-016
                        console.log(`Program found: ${program.name}, Cost: KES ${programCostNum}`);

                        if (programCostNum > 0) {
                            // SEV-H-016 TODO: `balance` is NOT a field on the Student
                            // schema, so this write is dropped by Drizzle strict mode
                            // and is not persisted today. A correct fix (a Decimal128
                            // Student.balance updated via an atomic $inc inside a
                            // replica-set transaction) needs a data-model decision and
                            // is deferred to Stage 3 — see STAGE2A_REPORT.md.
                            const existingBalance = toMoneyNumber(currentStudent.balance || 0);
                            const newBalance = existingBalance + programCostNum;
                            updateData.balance = newBalance;

                            console.log(`Adding program cost KES ${programCostNum.toLocaleString()} to existing balance KES ${existingBalance.toLocaleString()}`);
                            console.log(`New balance will be: KES ${newBalance.toLocaleString()}`);
                        } else {
                            console.warn(`Program cost is not set or is zero for ${program.name}`);
                        }
                    } else {
                        console.warn(`Program not found for course: ${currentStudent.course} (mapped to: ${programName})`);
                    }
                } else {
                    console.log(`Year not changed (both are ${year}), no balance update needed`);
                }
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
        if (error.code === 11000) {
            return res.status(400).json({ message: 'ID number or phone number already exists' });
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
