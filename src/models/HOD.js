const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const hodSchema = new mongoose.Schema({
    department: {
        type: String,
        required: true,
        unique: true,
        enum: ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics'],
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        default: 'HOD' // Default password
    },
    phone: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
hodSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        this.updatedAt = new Date();
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
hodSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Update last login
hodSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

// Static method to get department display name
hodSchema.statics.getDepartmentDisplayName = function(departmentCode) {
    const departmentNames = {
        'applied_science': 'Applied Science',
        'agriculture': 'Agriculture',
        'building_civil': 'Building & Civil Engineering',
        'electromechanical': 'Electromechanical Engineering',
        'hospitality': 'Hospitality',
        'business_liberal': 'Business & Liberal Studies',
        'computing_informatics': 'Computing & Informatics'
    };
    return departmentNames[departmentCode] || departmentCode;
};

// Static method to get all departments
hodSchema.statics.getAllDepartments = function() {
    return [
        { code: 'applied_science', name: 'Applied Science' },
        { code: 'agriculture', name: 'Agriculture' },
        { code: 'building_civil', name: 'Building & Civil Engineering' },
        { code: 'electromechanical', name: 'Electromechanical Engineering' },
        { code: 'hospitality', name: 'Hospitality' },
        { code: 'business_liberal', name: 'Business & Liberal Studies' },
        { code: 'computing_informatics', name: 'Computing & Informatics' }
    ];
};

module.exports = mongoose.model('HOD', hodSchema);

