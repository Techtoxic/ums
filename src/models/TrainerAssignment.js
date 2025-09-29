const mongoose = require('mongoose');

const trainerAssignmentSchema = new mongoose.Schema({
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trainer',
        required: true,
        index: true
    },
    unitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true,
        index: true
    },
    courseCode: {
        type: String,
        required: true,
        index: true
    },
    department: {
        type: String,
        required: true,
        enum: ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics'],
        index: true
    },
    assignedBy: {
        type: String, // HOD email/username who assigned
        required: true
    },
    assignedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    semester: {
        type: String,
        enum: ['current', 'upcoming'],
        default: 'current'
    },
    academicYear: {
        type: String,
        default: function() {
            const currentDate = new Date();
            const year = currentDate.getFullYear();
            return `${year}/${year + 1}`;
        }
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'cancelled'],
        default: 'active'
    },
    notes: {
        type: String,
        default: ''
    }
});

// Compound indexes for efficient queries
trainerAssignmentSchema.index({ trainerId: 1, status: 1 });
trainerAssignmentSchema.index({ unitId: 1, status: 1 });
trainerAssignmentSchema.index({ department: 1, academicYear: 1 });
trainerAssignmentSchema.index({ courseCode: 1, status: 1 });

// Ensure unique assignment per unit per semester/year
trainerAssignmentSchema.index({ 
    unitId: 1, 
    semester: 1, 
    academicYear: 1, 
    status: 1 
}, { 
    unique: true,
    partialFilterExpression: { status: 'active' }
});

// Static method to assign units to trainer
trainerAssignmentSchema.statics.assignUnitsToTrainer = async function(trainerId, unitIds, assignedBy, department) {
    const Unit = mongoose.model('Unit');
    const Trainer = mongoose.model('Trainer');
    
    // Verify trainer exists
    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
        throw new Error('Trainer not found');
    }
    
    const assignments = [];
    
    for (const unitId of unitIds) {
        try {
            // Get unit details
            const unit = await Unit.findById(unitId);
            if (!unit) {
                console.warn(`Unit with ID ${unitId} not found, skipping assignment.`);
                continue;
            }
            
            // Check if unit is already assigned to any trainer
            const existingAssignment = await this.findOne({
                unitId: unitId,
                status: 'active'
            });
            
            if (existingAssignment) {
                // Update existing assignment to new trainer
                existingAssignment.trainerId = trainerId;
                existingAssignment.assignedBy = assignedBy;
                existingAssignment.assignedAt = new Date();
                await existingAssignment.save();
                assignments.push(existingAssignment);
                console.log(`Updated assignment for unit ${unit.unitCode} to trainer ${trainer.name}`);
            } else {
                // Create new assignment
                const assignment = new this({
                    trainerId,
                    unitId,
                    courseCode: unit.courseCode,
                    unitCode: unit.unitCode,
                    unitName: unit.unitName,
                    department,
                    assignedBy,
                    status: 'active' // Explicitly set status
                });
                
                await assignment.save();
                assignments.push(assignment);
                console.log(`Created new assignment for unit ${unit.unitCode} to trainer ${trainer.name}`);
            }
        } catch (error) {
            console.error(`Error processing unit ${unitId}:`, error);
            // Continue with other units even if one fails
        }
    }
    
    console.log(`Successfully processed ${assignments.length} assignments for trainer ${trainer.name}`);
    return assignments;
};

// Static method to get assignments by trainer
trainerAssignmentSchema.statics.getAssignmentsByTrainer = function(trainerId) {
    return this.find({ 
        trainerId: trainerId, 
        status: 'active' 
    })
    .populate('unitId', 'unitName unitCode courseCode level')
    .sort({ assignedAt: -1 });
};

// Static method to get assignments by department
trainerAssignmentSchema.statics.getAssignmentsByDepartment = function(department) {
    return this.find({ 
        department: department, 
        status: 'active' 
    })
    .populate('trainerId', 'name email')
    .populate('unitId', 'unitName unitCode courseCode level')
    .sort({ assignedAt: -1 });
};

// Static method to unassign units
trainerAssignmentSchema.statics.unassignUnits = function(unitIds) {
    return this.updateMany(
        { unitId: { $in: unitIds }, status: 'active' },
        { status: 'cancelled' }
    );
};

module.exports = mongoose.model('TrainerAssignment', trainerAssignmentSchema);

