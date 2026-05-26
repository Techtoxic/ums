const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { ToolRequest, User, Notification } = require('../db/models');

// Get all open tool requests (Deputy/admin overview). Soft-deleted rows are excluded
// in JS because the makeModel shim's .find() does not auto-filter deleted_at, and the
// chained .sort() on its result is a no-op (so sorting is done via the DB queryOpts).
router.get('/tool-requests', verifyToken, authorize('admin', 'deputy', 'trainer', 'hod'), async (req, res) => {
    try {
        const rows = await ToolRequest.find({ status: 'open' }, null, { sort: { createdAt: -1 } });
        const requests = rows.filter(r => !r.deletedAt);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching tool requests:', error);
        res.status(500).json({ message: 'Failed to fetch tool requests' });
    }
});

// Get open tool requests targeted at a specific trainer (uuid param). A request applies to a
// trainer if it targets the whole faculty, their department, or them directly.
router.get('/tool-requests/trainer/:trainerId', verifyToken, authorize('admin', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const trainer = await User.findById(req.params.trainerId);
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        const rows = await ToolRequest.find({ status: 'open' }, null, { sort: { createdAt: -1 } });
        const requests = rows.filter(r => !r.deletedAt && (
            r.targetType === 'faculty' ||
            (r.targetType === 'department' && r.targetDepartment === trainer.department) ||
            (r.targetType === 'trainer' && r.targetTrainerId === trainer.id)
        ));
        res.json(requests);
    } catch (error) {
        console.error('Error fetching trainer requests:', error);
        res.status(500).json({ message: 'Failed to fetch trainer requests' });
    }
});

// Create a tool request (a Deputy asks a trainer/department/faculty to submit a tool).
router.post('/tool-requests', verifyToken, authorize('admin', 'deputy'), async (req, res) => {
    try {
        const { toolType, targetType, targetTrainerId, targetDepartment, dueDate, instructions } = req.body;

        if (!toolType || !targetType || !dueDate) {
            return res.status(400).json({ message: 'toolType, targetType and dueDate are required' });
        }
        if (!['trainer', 'department', 'faculty'].includes(targetType)) {
            return res.status(400).json({ message: "targetType must be 'trainer', 'department' or 'faculty'" });
        }
        if (targetType === 'trainer' && !targetTrainerId) {
            return res.status(400).json({ message: 'targetTrainerId is required when targetType is trainer' });
        }
        if (targetType === 'department' && !targetDepartment) {
            return res.status(400).json({ message: 'targetDepartment is required when targetType is department' });
        }

        const request = await ToolRequest.create({
            toolType,
            targetType,
            targetTrainerId: targetTrainerId || null,
            targetDepartment: targetDepartment || null,
            dueDate,
            instructions: instructions || null,
            requestedBy: req.user.userId,
            status: 'open',
        });

        // Resolve recipients — trainers are users with role 'trainer'.
        let recipientIds = [];
        if (targetType === 'trainer') {
            recipientIds = [targetTrainerId];
        } else if (targetType === 'department') {
            const trainers = await User.find({ role: 'trainer', department: targetDepartment });
            recipientIds = trainers.map(t => t.id);
        } else { // faculty — every trainer
            const trainers = await User.find({ role: 'trainer' });
            recipientIds = trainers.map(t => t.id);
        }

        const body = `You have a request to submit a ${toolType.replace(/_/g, ' ')}${dueDate ? ' by ' + new Date(dueDate).toLocaleDateString() : ''}.${instructions ? ' Instructions: ' + instructions : ''}`;
        for (const recipientId of recipientIds) {
            await Notification.create({
                recipientId,
                recipientType: 'user',
                title: 'New Tools of Trade Request',
                body,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tool request created',
            request,
            notified: recipientIds.length,
        });
    } catch (error) {
        console.error('Error creating tool request:', error);
        res.status(500).json({ message: 'Failed to create tool request', error: error.message });
    }
});

module.exports = router;
