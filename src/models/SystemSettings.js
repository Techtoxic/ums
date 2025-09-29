const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        enum: ['finance', 'academic', 'system', 'general'],
        default: 'general'
    },
    isActive: {
        type: Boolean,
        default: true
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

// Update the updatedAt field before saving
systemSettingsSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to get a setting value
systemSettingsSchema.statics.getSetting = async function(key, defaultValue = null) {
    try {
        const setting = await this.findOne({ key, isActive: true });
        return setting ? setting.value : defaultValue;
    } catch (error) {
        console.error(`Error getting setting ${key}:`, error);
        return defaultValue;
    }
};

// Static method to set a setting value
systemSettingsSchema.statics.setSetting = async function(key, value, description = '', category = 'general') {
    try {
        const setting = await this.findOneAndUpdate(
            { key },
            { 
                value, 
                description, 
                category,
                updatedAt: Date.now()
            },
            { 
                upsert: true, 
                new: true 
            }
        );
        return setting;
    } catch (error) {
        console.error(`Error setting ${key}:`, error);
        throw error;
    }
};

// Static method to get all settings by category
systemSettingsSchema.statics.getSettingsByCategory = function(category) {
    return this.find({ category, isActive: true }).sort({ key: 1 });
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);














