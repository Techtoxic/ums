const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, desc } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { isValidId } = require('../utils/validators');
const { Notification } = require('../db/models');

// Aliased users join to resolve the finance officer who generated a payslip.
const generatorUsers = alias(schema.users, 'generator');

// Column selection shared by the payslip GET endpoints: every payslips column
// (aliased to the camelCase keys the frontend/PDF reads) plus the trainer's
// name/email/department from the users join, and _id for the frontend.
const payslipSelection = {
    _id: schema.payslips.id,
    id: schema.payslips.id,
    trainerId: schema.payslips.trainer_id,
    month: schema.payslips.month,
    year: schema.payslips.year,
    amount: schema.payslips.amount,
    grossPay: schema.payslips.gross_pay,
    netPay: schema.payslips.net_pay,
    paye: schema.payslips.paye,
    nhif: schema.payslips.nhif,
    nssf: schema.payslips.nssf,
    paymentDate: schema.payslips.payment_date,
    isViewed: schema.payslips.is_viewed,
    viewedAt: schema.payslips.viewed_at,
    description: schema.payslips.description,
    generatedById: schema.payslips.generated_by,
    generatedByName: generatorUsers.name,
    createdAt: schema.payslips.created_at,
    updatedAt: schema.payslips.updated_at,
    trainerName: schema.users.name,
    email: schema.users.email,
    department: schema.users.department,
};

// Generate payslips (Finance admin)
router.post('/payslips/generate', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { trainerIds, month, year, amount, description } = req.body;

        // SEV-H-008: actor identity comes from the verified token, never the body.
        const generatedById = req.user.userId || null;

        if (!trainerIds || !Array.isArray(trainerIds) || trainerIds.length === 0 || !month || !year || !amount) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Period guard (backend-enforced): payslips may ONLY be generated for the
        // CURRENT month and CURRENT year. This blocks back-dated/future payslips
        // regardless of the client. Month is compared numerically so "06", "6"
        // and 6 all validate the same; year is compared numerically.
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonthNum = now.getMonth() + 1; // 1..12
        const yearNum = Number(year);
        const monthNum = parseInt(String(month).replace(/[^0-9]/g, ''), 10);
        if (!Number.isInteger(yearNum) || yearNum !== currentYear) {
            return res.status(400).json({ message: `Payslips can only be generated for the current year (${currentYear}).` });
        }
        if (!Number.isInteger(monthNum) || monthNum !== currentMonthNum) {
            const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            return res.status(400).json({ message: `Payslips can only be generated for the current month (${names[currentMonthNum]}).` });
        }

        const period = `${month} ${year}`;
        const yearInt = Number(year);
        const payslips = [];

        for (const trainerId of trainerIds) {
            // Verify the trainer exists (trainer_id is the trainer's users.id uuid).
            if (!isValidId(trainerId)) {
                console.warn(`Skipping invalid trainer id ${trainerId}`);
                continue;
            }
            const [trainer] = await db
                .select({ id: schema.users.id, name: schema.users.name })
                .from(schema.users)
                .where(eq(schema.users.id, trainerId))
                .limit(1);
            if (!trainer) {
                console.warn(`Trainer ${trainerId} not found`);
                continue;
            }

            // Duplicate check: one payslip per trainer per month/year.
            const [existing] = await db
                .select({ id: schema.payslips.id })
                .from(schema.payslips)
                .where(and(
                    eq(schema.payslips.trainer_id, trainerId),
                    eq(schema.payslips.month, month),
                    eq(schema.payslips.year, yearInt),
                ))
                .limit(1);
            if (existing) {
                console.warn(`Payslip already exists for ${trainer.name} for ${period}`);
                continue;
            }

            // gross_pay/net_pay/paye/nhif/nssf/payment_date have no data — left null.
            const [payslip] = await db
                .insert(schema.payslips)
                .values({
                    trainer_id: trainerId,
                    month,
                    year: yearInt,
                    amount: String(amount), // numeric(12,2) — pass exact string
                    description: description || 'Monthly Salary',
                    generated_by: generatedById,
                })
                .returning();
            payslips.push(payslip);

            // Notify the trainer (a trainer is a user; trainerId is its users.id uuid).
            await Notification.create({
                recipientId: trainerId,
                recipientType: 'user',
                title: 'New Payslip Generated',
                body: `Your payslip for ${period} has been generated. Amount: KES ${Number(amount).toLocaleString()}`,
            });
        }

        res.json({
            success: true,
            message: `Generated ${payslips.length} payslips`,
            payslips
        });
    } catch (error) {
        console.error('Error generating payslips:', error);
        res.status(500).json({ message: 'Error generating payslips', error: error.message });
    }
});

// Get trainer's payslips
router.get('/trainers/:trainerId/payslips', verifyToken, authorize('admin', 'finance', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;

        // Join users so each payslip carries trainerName/email/department for the
        // PDF builder. Newest-first by created_at (month is a text name, so it
        // can't be ordered chronologically; created_at is the reliable signal).
        const payslips = await db
            .select(payslipSelection)
            .from(schema.payslips)
            .innerJoin(schema.users, eq(schema.users.id, schema.payslips.trainer_id))
            .leftJoin(generatorUsers, eq(generatorUsers.id, schema.payslips.generated_by))
            .where(eq(schema.payslips.trainer_id, trainerId))
            .orderBy(desc(schema.payslips.created_at));

        res.json({ payslips });
    } catch (error) {
        console.error('Error fetching trainer payslips:', error);
        res.status(500).json({ message: 'Error fetching payslips' });
    }
});

// Get all payslips (Finance admin)
router.get('/payslips', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { month, year } = req.query;

        const conds = [];
        if (month && year) {
            conds.push(eq(schema.payslips.month, String(month)));
            conds.push(eq(schema.payslips.year, Number(year)));
        }

        const query = db
            .select(payslipSelection)
            .from(schema.payslips)
            .innerJoin(schema.users, eq(schema.users.id, schema.payslips.trainer_id))
            .leftJoin(generatorUsers, eq(generatorUsers.id, schema.payslips.generated_by));

        const payslips = await (conds.length ? query.where(and(...conds)) : query)
            .orderBy(desc(schema.payslips.created_at));

        res.json({ payslips });
    } catch (error) {
        console.error('Error fetching payslips:', error);
        res.status(500).json({ message: 'Error fetching payslips' });
    }
});

// Mark payslip as viewed
router.put('/payslips/:payslipId/view', verifyToken, authorize('admin', 'finance', 'trainer'), async (req, res) => {
    try {
        const { payslipId } = req.params;

        // SEV-H-007: do not leak existence — 403 for both not-found and not-owner.
        if (!isValidId(payslipId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const [payslip] = await db
            .select({ id: schema.payslips.id, trainerId: schema.payslips.trainer_id })
            .from(schema.payslips)
            .where(eq(schema.payslips.id, payslipId))
            .limit(1);
        if (!payslip) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        // A trainer may only mark their OWN payslip viewed; admin/finance bypass.
        // Compare against the trainer's users.id uuid (req.user.userId) — NOT email.
        if (!['admin', 'finance'].includes(req.user.role)) {
            if (String(payslip.trainerId) !== String(req.user.userId)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        await db
            .update(schema.payslips)
            .set({ is_viewed: true, viewed_at: new Date() })
            .where(eq(schema.payslips.id, payslipId));

        res.json({ success: true, message: 'Payslip marked as viewed' });
    } catch (error) {
        console.error('Error marking payslip as viewed:', error);
        res.status(500).json({ message: 'Error updating payslip' });
    }
});

module.exports = router;
