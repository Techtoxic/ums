/**
 * Trainer Data Parser
 * Parses trainers.txt file and organizes trainers by department
 */

const fs = require('fs');
const path = require('path');

function parseTrainersFile() {
    try {
        const trainersFilePath = path.join(__dirname, '..', 'components', 'trainer', 'trainers.txt');
        const trainersText = fs.readFileSync(trainersFilePath, 'utf-8');
        
        const lines = trainersText.split('\n').map(line => line.trim()).filter(line => line);
        const trainersByDepartment = {};
        let currentDepartment = null;
        
        for (const line of lines) {
            // Map department names to codes - check exact matches first
            const departmentMap = {
                'APPLIED SCIENCES': 'applied_science',
                'APPLIED SCIENCE': 'applied_science',
                'Hospitality': 'hospitality',
                'HOSPITALITY': 'hospitality',
                'Electromechanical': 'electromechanical',
                'ELECTROMECHANICAL': 'electromechanical',
                'Business and Liberal studies': 'business_liberal',
                'BUSINESS AND LIBERAL STUDIES': 'business_liberal',
                'BUSINESS & LIBERAL': 'business_liberal',
                'Agriculture': 'agriculture',
                'AGRICULTURE': 'agriculture',
                'Building and civil': 'building_civil',
                'BUILDING AND CIVIL': 'building_civil',
                'BUILDING & CIVIL': 'building_civil',
                'COMPUTING & INFORMATICS': 'computing_informatics',
                'COMPUTING AND INFORMATICS': 'computing_informatics'
            };
            
            // Check if line is a department header
            if (departmentMap[line]) {
                currentDepartment = departmentMap[line];
                console.log(`Found department: "${line}" -> ${currentDepartment}`);
                
                if (!trainersByDepartment[currentDepartment]) {
                    trainersByDepartment[currentDepartment] = [];
                }
            } else if (currentDepartment && line.length > 0) {
                // This is a trainer name - clean it by removing numbers and dots
                let cleanName = line
                    .replace(/^\d+\.?\s*/, '') // Remove leading numbers and dots
                    .trim();
                
                if (cleanName.length > 0) {
                    const trainer = {
                        name: cleanName,
                        department: currentDepartment,
                        email: generateEmailFromName(cleanName),
                        isActive: true
                    };
                    console.log(`  Adding trainer: ${cleanName} to department: ${currentDepartment}`);
                    trainersByDepartment[currentDepartment].push(trainer);
                }
            }
        }
        
        return trainersByDepartment;
    } catch (error) {
        console.error('Error parsing trainers file:', error);
        return {};
    }
}

function generateEmailFromName(fullName) {
    // Remove titles and generate email
    const cleanName = fullName
        .replace(/^(Mr|Madam|Ms|Dr|Mrs)\.?\s+/i, '')
        .toLowerCase()
        .replace(/\s+/g, '.');
    
    return `${cleanName}@ace.ac.ke`;
}

function getAllTrainers() {
    const trainersByDepartment = parseTrainersFile();
    const allTrainers = [];
    
    for (const department in trainersByDepartment) {
        allTrainers.push(...trainersByDepartment[department]);
    }
    
    return allTrainers;
}

function getTrainersByDepartment(department) {
    const trainersByDepartment = parseTrainersFile();
    return trainersByDepartment[department] || [];
}

function getDepartmentsWithTrainers() {
    const trainersByDepartment = parseTrainersFile();
    return Object.keys(trainersByDepartment);
}

module.exports = {
    parseTrainersFile,
    getAllTrainers,
    getTrainersByDepartment,
    getDepartmentsWithTrainers,
    generateEmailFromName
};

