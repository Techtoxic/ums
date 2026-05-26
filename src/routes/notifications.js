const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { Notification, Student, User } = require('../db/models');

// Get all notifications (for admin/deputy)
router.get('/', verifyToken, authorize('admin', 'registrar', 'finance', 'dean', 'cibec', 'ilo', 'deputy', 'hod'), async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching all notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// Get notifications for a user
router.get('/:userId', verifyToken, authorize('admin', 'student', 'trainer', 'hod', 'registrar', 'cibec', 'ilo'), verifyOwnership('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { isRead, type, limit = 50 } = req.query;

        let query = { recipientId: userId };
        if (isRead !== undefined) query.isRead = isRead === 'true';
        if (type) query.type = type;

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// Mark notification as read
router.patch('/:notificationId/read', verifyToken, authorize('admin', 'student', 'trainer', 'hod', 'registrar', 'finance', 'dean', 'deputy', 'ilo', 'cibec'), async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error marking notification as read' });
    }
});

// Mark all notifications as read for a user
router.patch('/:userId/read-all', verifyToken, authorize('admin', 'student', 'trainer', 'hod', 'registrar', 'finance', 'dean', 'deputy', 'ilo', 'cibec'), verifyOwnership('userId'), async (req, res) => {
    try {
        const { userId } = req.params;

        await Notification.updateMany(
            { recipientId: userId, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ message: 'Error marking notifications as read' });
    }
});

// Create notification
router.post('/', verifyToken, authorize('admin', 'registrar', 'hod', 'cibec', 'ilo', 'dean', 'finance'), async (req, res) => {
    try {
        const { recipientId, recipientType, title } = req.body;
        const body = req.body.body || req.body.message; // accept legacy `message` as a fallback

        if (!recipientId || !recipientType || !title || !body) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        if (recipientType !== 'student' && recipientType !== 'user') {
            return res.status(400).json({ message: 'recipientType must be student or user' });
        }

        const data = await Notification.create({ recipientId, recipientType, title, body });

        res.json({
            success: true,
            message: 'Notification created successfully',
            data
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ message: 'Error creating notification' });
    }
});

// Broadcast notification to all users of a type
router.post('/broadcast', verifyToken, authorize('admin', 'registrar', 'deputy'), async (req, res) => {
    try {
        const { role, title } = req.body;
        const body = req.body.body || req.body.message; // accept legacy `message` as a fallback

        if (!role || !title || !body) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Resolve recipients. Students live in the students table; every staff role
        // lives in the users table → recipient_type 'user'.
        let recipients = [];
        let recipientType;
        if (role === 'student') {
            recipients = await Student.find({});
            recipientType = 'student';
        } else {
            recipients = await User.find({ role });
            recipientType = 'user';
        }

        // The Notification shim has no insertMany — create one row per recipient.
        for (const recipient of recipients) {
            await Notification.create({
                recipientId: recipient.id,
                recipientType,
                title,
                body,
            });
        }

        res.json({
            success: true,
            message: `Notification sent to ${recipients.length} recipient(s)`,
            count: recipients.length
        });
    } catch (error) {
        console.error('Error broadcasting notification:', error);
        res.status(500).json({ message: 'Error broadcasting notification' });
    }
});

module.exports = router;
