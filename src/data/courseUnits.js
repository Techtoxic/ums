/**
 * Course Units Mapping
 * Maps course codes to their respective units
 * Units are consistent throughout the program (don't change by year)
 * Contains ALL units from the authoritative courses&units.txt file
 */

const courseUnits = {
    // Applied Science Department
    'analytical_chemistry_6': {
        department: 'applied_science',
        level: 6,
        units: [
            { unitCode: 'AC6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'AC6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'AC6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'AC6-004', unitName: 'Demonstrate Understanding of Entrepreneurship' },
            { unitCode: 'AC6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'AC6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'AC6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'AC6-008', unitName: 'Apply Physics Principles' },
            { unitCode: 'AC6-009', unitName: 'Apply Standard Laboratory Practices' },
            { unitCode: 'AC6-010', unitName: 'Apply Inorganic Chemistry' },
            { unitCode: 'AC6-011', unitName: 'Apply Physical Chemistry' },
            { unitCode: 'AC6-012', unitName: 'Apply Organic Chemistry' },
            { unitCode: 'AC6-013', unitName: 'Develop Standard Operating Test Procedures' },
            { unitCode: 'AC6-014', unitName: 'Perform Analytical Chemistry Techniques' },
            { unitCode: 'AC6-015', unitName: 'Collect and Prepare Analytical Chemistry Samples' },
            { unitCode: 'AC6-016', unitName: 'Analyse and Interpret Analytical Chemistry Data' },
            { unitCode: 'AC6-017', unitName: 'Manage Analytical Chemistry Laboratory, Reagents and Instruments' },
            { unitCode: 'AC6-018', unitName: 'Manage Analytical Chemistry Samples' }
        ]
    },

    'applied_biology_6': {
        department: 'applied_science',
        level: 6,
        units: [
            { unitCode: 'AP6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'AP6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'AP6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'AP6-004', unitName: 'Demonstrate Entrepreneural Skills' },
            { unitCode: 'AP6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'AP6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'AP6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'AP6-008', unitName: 'Perform Anatomy and Physiology Studies' },
            { unitCode: 'AP6-009', unitName: 'Apply Standard Laboratory Practice' },
            { unitCode: 'AP6-010', unitName: 'Carry out Microscopy' },
            { unitCode: 'AP6-011', unitName: 'Conduct Laboratory Research' },
            { unitCode: 'AP6-012', unitName: 'Carry out Cytological and Histological Techniques' },
            { unitCode: 'AP6-013', unitName: 'Carry out Microbiological Techniques' },
            { unitCode: 'AP6-014', unitName: 'Perform Taxonomic Studies' },
            { unitCode: 'AP6-015', unitName: 'Apply Herbarium Museum, Aquarium and Vivarium Techniques' },
            { unitCode: 'AP6-016', unitName: 'Carry out Ecological and Soil Studies' },
            { unitCode: 'AP6-017', unitName: 'Carry out Animal Husbandry' },
            { unitCode: 'AP6-018', unitName: 'Carry out Plant Husbandry' },
            { unitCode: 'AP6-019', unitName: 'Apply Entomology Techniques' },
            { unitCode: 'AP6-020', unitName: 'Carry out Parasitological Techniques' },
            { unitCode: 'AP6-021', unitName: 'Perform Imminological Techniques' },
            { unitCode: 'AP6-022', unitName: 'Apply Biochemical Techniques' },
            { unitCode: 'AP6-023', unitName: 'Perform Pharmacological and Toxicological Techniques' }
        ]
    },

    'science_laboratory_technology_5': {
        department: 'applied_science',
        level: 5,
        units: [
            { unitCode: 'SLT5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'SLT5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'SLT5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'SLT5-004', unitName: 'Demonstrate Entrepreneural Skills' },
            { unitCode: 'SLT5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'SLT5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'SLT5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'SLT5-008', unitName: 'Apply Standard Laboratory Practices' },
            { unitCode: 'SLT5-009', unitName: 'Apply Biology Techniques' },
            { unitCode: 'SLT5-010', unitName: 'Apply Laboratory Instrumentation' }
        ]
    },

    // Agriculture Department
    'general_agriculture_4': {
        department: 'agriculture',
        level: 4,
        units: [
            { unitCode: 'GA4-001', unitName: 'Communication Skills' },
            { unitCode: 'GA4-002', unitName: 'Numeracy Skills' },
            { unitCode: 'GA4-003', unitName: 'Digital Literacy' },
            { unitCode: 'GA4-004', unitName: 'Entrepreneurial Skills' },
            { unitCode: 'GA4-005', unitName: 'Employability Skills' },
            { unitCode: 'GA4-006', unitName: 'Environmental Literacy' },
            { unitCode: 'GA4-007', unitName: 'Occupational Safety and Health Practices' },
            { unitCode: 'GA4-008', unitName: 'Establishing Agricultural Crops' },
            { unitCode: 'GA4-009', unitName: 'Crop Protection' },
            { unitCode: 'GA4-010', unitName: 'Crop Harvesting' },
            { unitCode: 'GA4-011', unitName: 'Livestock Health Maintenance' },
            { unitCode: 'GA4-012', unitName: 'Livestock Feeding' },
            { unitCode: 'GA4-013', unitName: 'Livestock Breeding' },
            { unitCode: 'GA4-014', unitName: 'Farm Records Keeping' }
        ]
    },

    'sustainable_agriculture_5': {
        department: 'agriculture',
        level: 5,
        units: [
            { unitCode: 'SA5-001', unitName: 'Communication skills' },
            { unitCode: 'SA5-002', unitName: 'Numeracy skills' },
            { unitCode: 'SA5-003', unitName: 'Digital literacy' },
            { unitCode: 'SA5-004', unitName: 'Entrepreneurial skills' },
            { unitCode: 'SA5-005', unitName: 'Employability skills' },
            { unitCode: 'SA5-006', unitName: 'Environmental literacy' },
            { unitCode: 'SA5-007', unitName: 'Occupational safety and health practices' },
            { unitCode: 'SA5-008', unitName: 'Promote individual development and self-fulfillment' },
            { unitCode: 'SA5-009', unitName: 'Participatory development approaches and tools' },
            { unitCode: 'SA5-010', unitName: 'Agribusiness management' },
            { unitCode: 'SA5-011', unitName: 'Crop enterprise management' },
            { unitCode: 'SA5-012', unitName: 'Manage livestock water' },
            { unitCode: 'SA5-013', unitName: 'Manage environmental monitoring and compliance' },
            { unitCode: 'SA5-014', unitName: 'Protect biodiversity' },
            { unitCode: 'SA5-015', unitName: 'Farm records keeping' }
        ]
    },

    'agricultural_extension_6': {
        department: 'agriculture',
        level: 6,
        units: [
            { unitCode: 'AE6-001', unitName: 'Communication skills' },
            { unitCode: 'AE6-002', unitName: 'Occupational safety and health practices' },
            { unitCode: 'AE6-003', unitName: 'Numeracy skills' },
            { unitCode: 'AE6-004', unitName: 'Digital literacy' },
            { unitCode: 'AE6-005', unitName: 'Entrepreneurial skills' },
            { unitCode: 'AE6-006', unitName: 'Employability skills' },
            { unitCode: 'AE6-007', unitName: 'Environmental literacy' },
            { unitCode: 'AE6-008', unitName: 'Agricultural extension and rural sociology' },
            { unitCode: 'AE6-009', unitName: 'Livestock production' },
            { unitCode: 'AE6-010', unitName: 'Soil and water management' },
            { unitCode: 'AE6-011', unitName: 'Livestock feed formulation' },
            { unitCode: 'AE6-012', unitName: 'Farm product processing' },
            { unitCode: 'AE6-013', unitName: 'Crop protection' },
            { unitCode: 'AE6-014', unitName: 'Horticultural crop production' },
            { unitCode: 'AE6-015', unitName: 'Farm management' }
        ]
    },

    // Electromechanical Department
    'electrical_engineering_6': {
        department: 'electromechanical',
        level: 6,
        units: [
            { unitCode: 'EE6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'EE6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'EE6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'EE6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'EE6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'EE6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'EE6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'EE6-008', unitName: 'Apply Engineering Mathematics' },
            { unitCode: 'EE6-009', unitName: 'Prepare and Interpret Technical Drawing' },
            { unitCode: 'EE6-010', unitName: 'Install Solar System' },
            { unitCode: 'EE6-011', unitName: 'Install Security Systems' },
            { unitCode: 'EE6-012', unitName: 'Perform Electrical Installation' },
            { unitCode: 'EE6-013', unitName: 'Apply Electrical Principles' },
            { unitCode: 'EE6-014', unitName: 'Install Electrical Machine' },
            { unitCode: 'EE6-015', unitName: 'Automate Electrical Machine' },
            { unitCode: 'EE6-016', unitName: 'Demonstrate Understanding of Electronics' },
            { unitCode: 'EE6-017', unitName: 'Maintain Electrical Equipment and Systems' },
            { unitCode: 'EE6-018', unitName: 'Demonstrate Understanding of Power Generation' },
            { unitCode: 'EE6-019', unitName: 'Install Electrical Power Lines' }
        ]
    },

    'electrical_engineering_5': {
        department: 'electromechanical',
        level: 5,
        units: [
            { unitCode: 'EE5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'EE5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'EE5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'EE5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'EE5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'EE5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'EE5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'EE5-008', unitName: 'Engineering Mathematics' },
            { unitCode: 'EE5-009', unitName: 'Electrical Principles' },
            { unitCode: 'EE5-010', unitName: 'Workshop Technology' },
            { unitCode: 'EE5-011', unitName: 'Technical Drawing' },
            { unitCode: 'EE5-012', unitName: 'Electrical Installation Work Planning' },
            { unitCode: 'EE5-013', unitName: 'Performing Electrical Installation' },
            { unitCode: 'EE5-014', unitName: 'Testing of Electrical Installation' },
            { unitCode: 'EE5-015', unitName: 'Electrical Installation Maintenance' },
            { unitCode: 'EE5-016', unitName: 'Electrical Installation Breakdown Maintenance' },
            { unitCode: 'EE5-017', unitName: 'Industrial Attachment (Field Practicum)' }
        ]
    },

    'electrical_engineering_4': {
        department: 'electromechanical',
        level: 4,
        units: [
            { unitCode: 'EE4-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'EE4-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'EE4-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'EE4-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'EE4-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'EE4-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'EE4-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'EE4-008', unitName: 'Engineering Mathematics' },
            { unitCode: 'EE4-009', unitName: 'Electrical Principles' },
            { unitCode: 'EE4-010', unitName: 'Workshop Technology' },
            { unitCode: 'EE4-011', unitName: 'Technical Drawing' },
            { unitCode: 'EE4-012', unitName: 'Perform Electrical Installation' },
            { unitCode: 'EE4-013', unitName: 'Perform Testing of Electrical Installation' },
            { unitCode: 'EE4-014', unitName: 'Perform Electrical Breakdown Maintenance' }
        ]
    },

    'automotive_engineering_5': {
        department: 'electromechanical',
        level: 5,
        units: [
            { unitCode: 'AM5-001', unitName: 'Communication Skills' },
            { unitCode: 'AM5-002', unitName: 'Digital Literacy' },
            { unitCode: 'AM5-003', unitName: 'Entrepreneurial Skills' },
            { unitCode: 'AM5-004', unitName: 'Employability Skills' },
            { unitCode: 'AM5-005', unitName: 'Environmental Literacy' },
            { unitCode: 'AM5-006', unitName: 'Occupational Safety and Health Practices' },
            { unitCode: 'AM5-007', unitName: 'Technical Drawing' },
            { unitCode: 'AM5-008', unitName: 'Applied Engineering Mathematics' },
            { unitCode: 'AM5-009', unitName: 'Automotive Engineering Principles' },
            { unitCode: 'AM5-010', unitName: 'Workshop Technology Principles' },
            { unitCode: 'AM5-011', unitName: 'Vehicle Basic Maintenance' },
            { unitCode: 'AM5-012', unitName: 'Servicing and Repairing Vehicle Engine Components' },
            { unitCode: 'AM5-013', unitName: 'Servicing Vehicle Fuel System' },
            { unitCode: 'AM5-014', unitName: 'Servicing Vehicle Transmission Systems' },
            { unitCode: 'AM5-015', unitName: 'Servicing Vehicle Steering Systems' },
            { unitCode: 'AM5-016', unitName: 'Servicing Vehicle Suspension Systems' },
            { unitCode: 'AM5-017', unitName: 'Servicing Vehicle Braking Systems' },
            { unitCode: 'AM5-018', unitName: 'Servicing Vehicle Electrical Systems' },
            { unitCode: 'AM5-019', unitName: 'Performing Vehicle Body Works' }
        ]
    },

    'automotive_engineering_6': {
        department: 'electromechanical',
        level: 6,
        units: [
            { unitCode: 'AM6-001', unitName: 'Communication Skills' },
            { unitCode: 'AM6-002', unitName: 'Digital Literacy' },
            { unitCode: 'AM6-003', unitName: 'Entrepreneurial Skills' },
            { unitCode: 'AM6-004', unitName: 'Employability Skills' },
            { unitCode: 'AM6-005', unitName: 'Environmental Literacy' },
            { unitCode: 'AM6-006', unitName: 'Occupational Safety and Health Practices' },
            { unitCode: 'AM6-007', unitName: 'Technical Drawing' },
            { unitCode: 'AM6-008', unitName: 'Workshop Technology Principles' },
            { unitCode: 'AM6-009', unitName: 'Performing Vehicle Basic Maintenance' },
            { unitCode: 'AM6-010', unitName: 'Servicing and Repairing Vehicle Engine Components' },
            { unitCode: 'AM6-011', unitName: 'Servicing Vehicle Fuel System' },
            { unitCode: 'AM6-012', unitName: 'Servicing Vehicle Transmission Systems' },
            { unitCode: 'AM6-013', unitName: 'Servicing Vehicle Steering Systems' },
            { unitCode: 'AM6-014', unitName: 'Servicing Vehicle Suspension Systems' },
            { unitCode: 'AM6-015', unitName: 'Servicing Vehicle Braking Systems' },
            { unitCode: 'AM6-016', unitName: 'Servicing Vehicle Electrical Systems' }
        ]
    },

    // Building and Civil Department
    'building_technician_6': {
        department: 'building_civil',
        level: 6,
        units: [
            { unitCode: 'BT6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'BT6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'BT6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'BT6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'BT6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'BT6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'BT6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'BT6-008', unitName: 'Apply Engineering Mathematics' },
            { unitCode: 'BT6-009', unitName: 'Prepare and Interpret Technical Drawing' },
            { unitCode: 'BT6-010', unitName: 'Apply Building Materials Science' },
            { unitCode: 'BT6-011', unitName: 'Apply Workshop Technology Practices' },
            { unitCode: 'BT6-012', unitName: 'Execute Building Temporary Works' },
            { unitCode: 'BT6-013', unitName: 'Produce Building Drawings' },
            { unitCode: 'BT6-014', unitName: 'Execute Site Preliminary Works' },
            { unitCode: 'BT6-015', unitName: 'Produce Masonry Units' },
            { unitCode: 'BT6-016', unitName: 'Manage Construction Materials, Plant, Tools and Equipment' },
            { unitCode: 'BT6-017', unitName: 'Execute Substructure Works' },
            { unitCode: 'BT6-018', unitName: 'Execute Superstructure Works' },
            { unitCode: 'BT6-019', unitName: 'Execute Building Finishes' },
            { unitCode: 'BT6-020', unitName: 'Execute Building External Works' },
            { unitCode: 'BT6-021', unitName: 'Install Building Services' },
            { unitCode: 'BT6-022', unitName: 'Install Building Doors and Windows' },
            { unitCode: 'BT6-023', unitName: 'Supervise Construction Projects' },
            { unitCode: 'BT6-024', unitName: 'Apply Mathematics Skills' },
            { unitCode: 'BT6-025', unitName: 'Perform Structural Design and Analysis' },
            { unitCode: 'BT6-026', unitName: 'Perform Measurement of Works and Cost Estimation' },
            { unitCode: 'BT6-027', unitName: 'Apply Water and Wastewater Technology' },
            { unitCode: 'BT6-028', unitName: 'Apply Water Resource, Water and Sanitation Services Management Principles' },
            { unitCode: 'BT6-029', unitName: 'Conduct Material Testing' },
            { unitCode: 'BT6-030', unitName: 'Perform Highway Survey' },
            { unitCode: 'BT6-031', unitName: 'Design Basic Pavement Structures' },
            { unitCode: 'BT6-032', unitName: 'Carry Out Road Construction Works' },
            { unitCode: 'BT6-033', unitName: 'Design Engineering Structures' },
            { unitCode: 'BT6-034', unitName: 'Carry Out Building Works' },
            { unitCode: 'BT6-035', unitName: 'Manage Water Resources Quality' },
            { unitCode: 'BT6-036', unitName: 'Design Wastewater Collection and Treatment Infrastructure' },
            { unitCode: 'BT6-037', unitName: 'Construct Wastewater Infrastructure' },
            { unitCode: 'BT6-038', unitName: 'Design Onsite Sanitation Facilities' },
            { unitCode: 'BT6-039', unitName: 'Construct Onsite Sanitation Facilities' },
            { unitCode: 'BT6-040', unitName: 'Manage Civil Engineering Projects' }
        ]
    },

    'building_technician_5': {
        department: 'building_civil',
        level: 5,
        units: [
            { unitCode: 'BT5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'BT5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'BT5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'BT5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'BT5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'BT5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'BT5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'BT5-008', unitName: 'Apply Engineering Mathematics' },
            { unitCode: 'BT5-009', unitName: 'Apply Technical Drawing' },
            { unitCode: 'BT5-010', unitName: 'Apply Scientific Principles' },
            { unitCode: 'BT5-011', unitName: 'Perform Construction Site Preliminary Works' },
            { unitCode: 'BT5-012', unitName: 'Execute Building Substructure Works' },
            { unitCode: 'BT5-013', unitName: 'Execute Building Superstructure Works' },
            { unitCode: 'BT5-014', unitName: 'Construct Roof Structures' },
            { unitCode: 'BT5-015', unitName: 'Install Building Doors and Windows' },
            { unitCode: 'BT5-016', unitName: 'Execute Building Finishes' },
            { unitCode: 'BT5-017', unitName: 'Execute External Works' }
        ]
    },

    'building_technician_4': {
        department: 'building_civil',
        level: 4,
        units: [
            { unitCode: 'BT4-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'BT4-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'BT4-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'BT4-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'BT4-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'BT4-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'BT4-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'BT4-008', unitName: 'Apply Building Materials Science' },
            { unitCode: 'BT4-009', unitName: 'Apply Workshop Technology Practices' },
            { unitCode: 'BT4-010', unitName: 'Execute Building Temporary Works' },
            { unitCode: 'BT4-011', unitName: 'Execute Site Preliminary Works' },
            { unitCode: 'BT4-012', unitName: 'Execute Substructure Works' },
            { unitCode: 'BT4-013', unitName: 'Execute Superstructure Works' },
            { unitCode: 'BT4-014', unitName: 'Execute Building Finishes' },
            { unitCode: 'BT4-015', unitName: 'Install Building Services' }
        ]
    },

    'civil_engineering_6': {
        department: 'building_civil',
        level: 6,
        units: [
            { unitCode: 'CE6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'CE6-002', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'CE6-003', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'CE6-004', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'CE6-005', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'CE6-006', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'CE6-007', unitName: 'Apply Mathematics Skills' },
            { unitCode: 'CE6-008', unitName: 'Prepare and Interpret Technical Drawings' },
            { unitCode: 'CE6-009', unitName: 'Perform Structural Design and Analysis' },
            { unitCode: 'CE6-010', unitName: 'Apply Construction Material Science' },
            { unitCode: 'CE6-011', unitName: 'Apply Workshop Technology Practices' },
            { unitCode: 'CE6-012', unitName: 'Perform Measurement of Works and Cost Estimation' },
            { unitCode: 'CE6-013', unitName: 'Apply Water and Wastewater Technology' },
            { unitCode: 'CE6-014', unitName: 'Apply Water Resource, Water and Sanitation Services Management Principles' },
            { unitCode: 'CE6-015', unitName: 'Conduct Material Testing' },
            { unitCode: 'CE6-016', unitName: 'Perform Highway Survey' },
            { unitCode: 'CE6-017', unitName: 'Design Basic Pavement Structures' },
            { unitCode: 'CE6-018', unitName: 'Carry Out Road Construction Works' },
            { unitCode: 'CE6-019', unitName: 'Design Engineering Structures' },
            { unitCode: 'CE6-020', unitName: 'Produce Building Drawings' },
            { unitCode: 'CE6-021', unitName: 'Carry Out Building Works' },
            { unitCode: 'CE6-022', unitName: 'Manage Water Resources Quality' },
            { unitCode: 'CE6-023', unitName: 'Design Wastewater Collection and Treatment Infrastructure' },
            { unitCode: 'CE6-024', unitName: 'Construct Wastewater Infrastructure' },
            { unitCode: 'CE6-025', unitName: 'Design Onsite Sanitation Facilities' },
            { unitCode: 'CE6-026', unitName: 'Construct Onsite Sanitation Facilities' },
            { unitCode: 'CE6-027', unitName: 'Manage Civil Engineering Projects' }
        ]
    },

    'plumbing_5': {
        department: 'building_civil',
        level: 5,
        units: [
            { unitCode: 'PL5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'PL5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'PL5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'PL5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'PL5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'PL5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'PL5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'PL5-008', unitName: 'Apply Mathematical Skills' },
            { unitCode: 'PL5-009', unitName: 'Apply Technical Drawing' },
            { unitCode: 'PL5-010', unitName: 'Apply Scientific Principles' },
            { unitCode: 'PL5-011', unitName: 'Install Water Supply Systems' },
            { unitCode: 'PL5-012', unitName: 'Install Rainwater Harvesting and Disposal Systems' },
            { unitCode: 'PL5-013', unitName: 'Install Drainage Systems' },
            { unitCode: 'PL5-014', unitName: 'Install Sanitary Appliances' },
            { unitCode: 'PL5-015', unitName: 'Install Water Storage Systems and Auxiliary Fittings' },
            { unitCode: 'PL5-016', unitName: 'Maintain Plumbing Systems' },
            { unitCode: 'PL5-017', unitName: 'Install Fire Control Systems' }
        ]
    },

    'plumbing_4': {
        department: 'building_civil',
        level: 4,
        units: [
            { unitCode: 'PL4-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'PL4-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'PL4-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'PL4-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'PL4-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'PL4-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'PL4-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'PL4-008', unitName: 'Apply Mathematical Skills' },
            { unitCode: 'PL4-009', unitName: 'Perform Workshop Processes' },
            { unitCode: 'PL4-010', unitName: 'Apply Technical Drawing' },
            { unitCode: 'PL4-011', unitName: 'Apply Scientific Principles' },
            { unitCode: 'PL4-012', unitName: 'Install Water Pipes and Ancillary Appliances' },
            { unitCode: 'PL4-013', unitName: 'Install Rainwater Harvesting Systems' },
            { unitCode: 'PL4-014', unitName: 'Install Drainage Systems' },
            { unitCode: 'PL4-015', unitName: 'Install Sanitary Appliances' },
            { unitCode: 'PL4-016', unitName: 'Install Water Storage Systems and Ancillary Fittings' },
            { unitCode: 'PL4-017', unitName: 'Maintain Plumbing Systems' }
        ]
    },

    // ICT Department
    'ict_5': {
        department: 'computing_informatics',
        level: 5,
        units: [
            { unitCode: 'ICT5-001', unitName: 'Communication Skills' },
            { unitCode: 'ICT5-002', unitName: 'Numeracy Skills' },
            { unitCode: 'ICT5-003', unitName: 'Digital Literacy' },
            { unitCode: 'ICT5-004', unitName: 'Entrepreneurial Skills' },
            { unitCode: 'ICT5-005', unitName: 'Employability Skills' },
            { unitCode: 'ICT5-006', unitName: 'Environmental Literacy' },
            { unitCode: 'ICT5-007', unitName: 'Occupational Safety & Health Practices' },
            { unitCode: 'ICT5-008', unitName: 'Networking' },
            { unitCode: 'ICT5-009', unitName: 'Computer Software Installation' },
            { unitCode: 'ICT5-010', unitName: 'Computer Repair & Maintenance' },
            { unitCode: 'ICT5-011', unitName: 'Database Management' },
            { unitCode: 'ICT5-012', unitName: 'Computer Programming' },
            { unitCode: 'ICT5-013', unitName: 'Operating System Management' },
            { unitCode: 'ICT5-014', unitName: 'Industrial Attachment' }
        ]
    },

    'ict_6': {
        department: 'computing_informatics',
        level: 6,
        units: [
            { unitCode: 'ICT6-001', unitName: 'Communication Skills' },
            { unitCode: 'ICT6-002', unitName: 'Numeracy Skills' },
            { unitCode: 'ICT6-003', unitName: 'Digital Literacy' },
            { unitCode: 'ICT6-004', unitName: 'Entrepreneurial Skills' },
            { unitCode: 'ICT6-005', unitName: 'Employability Skills' },
            { unitCode: 'ICT6-006', unitName: 'Environmental Literacy' },
            { unitCode: 'ICT6-007', unitName: 'Occupational Safety & Health Practices' },
            { unitCode: 'ICT6-008', unitName: 'Basic Electronics' },
            { unitCode: 'ICT6-009', unitName: 'Computer Networking' },
            { unitCode: 'ICT6-010', unitName: 'Computer Software Installation' },
            { unitCode: 'ICT6-011', unitName: 'ICT Security Threats Control' },
            { unitCode: 'ICT6-012', unitName: 'ICT System Support' },
            { unitCode: 'ICT6-013', unitName: 'Website Design' },
            { unitCode: 'ICT6-014', unitName: 'Computer Repair & Maintenance' },
            { unitCode: 'ICT6-015', unitName: 'Database Management' },
            { unitCode: 'ICT6-016', unitName: 'Information Systems Management' },
            { unitCode: 'ICT6-017', unitName: 'Graphic Design' },
            { unitCode: 'ICT6-018', unitName: 'Computer Programming' },
            { unitCode: 'ICT6-019', unitName: 'Mobile Application Development' },
            { unitCode: 'ICT6-020', unitName: 'System Analysis and Design' },
            { unitCode: 'ICT6-021', unitName: 'Industrial Attachment' }
        ]
    },

    'information_science_5': {
        department: 'computing_informatics',
        level: 5,
        units: [
            { unitCode: 'IS5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'IS5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'IS5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'IS5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'IS5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'IS5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'IS5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'IS5-008', unitName: 'Search Library Information and Database' },
            { unitCode: 'IS5-009', unitName: 'Perform Information and Recordkeeping Practice' },
            { unitCode: 'IS5-010', unitName: 'Perform Cataloguing Process' },
            { unitCode: 'IS5-011', unitName: 'Maintain School Libraries, Media and Documentation Centres' },
            { unitCode: 'IS5-012', unitName: 'Maintain Information Resources' }
        ]
    },

    'information_science_6': {
        department: 'computing_informatics',
        level: 6,
        units: [
            { unitCode: 'IS6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'IS6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'IS6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'IS6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'IS6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'IS6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'IS6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'IS6-008', unitName: 'Search Library Information and Databases' },
            { unitCode: 'IS6-009', unitName: 'Maintain Information Resources' },
            { unitCode: 'IS6-010', unitName: 'Conserve and Preserve Library Materials' },
            { unitCode: 'IS6-011', unitName: 'Analyze Information Resources' },
            { unitCode: 'IS6-012', unitName: 'Demonstrate Understanding of Publishing and Book Trade' },
            { unitCode: 'IS6-013', unitName: 'Use Integrated Management Systems' },
            { unitCode: 'IS6-014', unitName: 'Provide Subject Access' },
            { unitCode: 'IS6-015', unitName: 'Perform Cataloguing Activities' },
            { unitCode: 'IS6-016', unitName: 'Manage Records and Information' }
        ]
    },

    'office_administration_5': {
        department: 'business_liberal',
        level: 5,
        units: [
            { unitCode: 'OA5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'OA5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'OA5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'OA5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'OA5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'OA5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'OA5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'OA5-008', unitName: 'Shorthand Skills' },
            { unitCode: 'OA5-009', unitName: 'ICT Skills' },
            { unitCode: 'OA5-010', unitName: 'Front Office Operations' },
            { unitCode: 'OA5-011', unitName: 'Office Mail Management' },
            { unitCode: 'OA5-012', unitName: 'Office Document Filing' },
            { unitCode: 'OA5-013', unitName: 'Official Meeting Coordination' }
        ]
    },

    'office_administration_6': {
        department: 'business_liberal',
        level: 6,
        units: [
            { unitCode: 'OA6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'OA6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'OA6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'OA6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'OA6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'OA6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'OA6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'OA6-008', unitName: 'Manage Front Office Operations' },
            { unitCode: 'OA6-009', unitName: 'Manage Office Mail' },
            { unitCode: 'OA6-010', unitName: 'Coordinate Official Meetings' },
            { unitCode: 'OA6-011', unitName: 'Manage Telephone Calls' }
        ]
    },

    'social_work_5': {
        department: 'business_liberal',
        level: 5,
        units: [
            { unitCode: 'SW5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'SW5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'SW5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'SW5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'SW5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'SW5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'SW5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'SW5-008', unitName: 'Conduct Social Research Works' },
            { unitCode: 'SW5-009', unitName: 'Perform Psycho-Social Support' },
            { unitCode: 'SW5-010', unitName: 'Conduct Social Policy Implementation (Formulation & Public Administration)' },
            { unitCode: 'SW5-011', unitName: 'Manage Project Resources' },
            { unitCode: 'SW5-012', unitName: 'Carry Out Community Awareness Activities' },
            { unitCode: 'SW5-013', unitName: 'Carry Out Advocacy and Lobbying Activities' },
            { unitCode: 'SW5-014', unitName: 'Undertake Conflict Resolution and Management' },
            { unitCode: 'SW5-015', unitName: 'Perform Home-Based Care and Support' },
            { unitCode: 'SW5-016', unitName: 'Carry Out Child Welfare Programmes' },
            { unitCode: 'SW5-017', unitName: 'Manage Community-Based Groups' },
            { unitCode: 'SW5-018', unitName: 'Conduct Community Crisis and Disaster Sensitization Programmes' },
            { unitCode: 'SW5-019', unitName: 'Industrial Attachment (Field Practicum)' }
        ]
    },

    'social_work_6': {
        department: 'business_liberal',
        level: 6,
        units: [
            { unitCode: 'SW6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'SW6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'SW6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'SW6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'SW6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'SW6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'SW6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'SW6-008', unitName: 'Conduct Social Research Works' },
            { unitCode: 'SW6-009', unitName: 'Social Policy Formulation and Public Administration' },
            { unitCode: 'SW6-010', unitName: 'Psycho-Social Support' },
            { unitCode: 'SW6-011', unitName: 'Resource Mobilization and Fund Raising' },
            { unitCode: 'SW6-012', unitName: 'Manage Community Resources' },
            { unitCode: 'SW6-013', unitName: 'Conduct Community Empowerment' },
            { unitCode: 'SW6-014', unitName: 'Coordinate Community Projects' },
            { unitCode: 'SW6-015', unitName: 'Conduct Community Awareness Training and Sensitization' },
            { unitCode: 'SW6-016', unitName: 'Carry Out Advocacy and Lobbying Activities' },
            { unitCode: 'SW6-017', unitName: 'Carry Out Crisis and Disaster Management' },
            { unitCode: 'SW6-018', unitName: 'Coordinate Conflict Resolution and Management' },
            { unitCode: 'SW6-019', unitName: 'Perform Home-Based Care and Support' },
            { unitCode: 'SW6-020', unitName: 'Coordinate Rehabilitation Programmes' },
            { unitCode: 'SW6-021', unitName: 'Carry Out Child Welfare Programmes' },
            { unitCode: 'SW6-022', unitName: 'Conduct Case Management' },
            { unitCode: 'SW6-023', unitName: 'Manage Community-Based Groups' },
            { unitCode: 'SW6-024', unitName: 'Industrial Attachment (Field Practicum)' }
        ]
    },

    'tourism_management_5': {
        department: 'hospitality',
        level: 5,
        units: [
            { unitCode: 'TM5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'TM5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'TM5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'TM5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'TM5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'TM5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'TM5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'TM5-008', unitName: 'Develop tour packages' },
            { unitCode: 'TM5-009', unitName: 'Develop travel packages' },
            { unitCode: 'TM5-010', unitName: 'Participate in tour delivery' },
            { unitCode: 'TM5-011', unitName: 'Participate in travel service delivery' },
            { unitCode: 'TM5-012', unitName: 'Market tour and travel products' },
            { unitCode: 'TM5-013', unitName: 'Provide customer service' },
            { unitCode: 'TM5-014', unitName: 'Participate in tour office operations' },
            { unitCode: 'TM5-015', unitName: 'Participate in travel office operations' },
            { unitCode: 'TM5-016', unitName: 'Provide tour guiding services' },
            { unitCode: 'TM5-017', unitName: 'Promote sustainable tourism' }
        ]
    },

    'tourism_management_6': {
        department: 'hospitality',
        level: 6,
        units: [
            { unitCode: 'TM6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'TM6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'TM6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'TM6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'TM6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'TM6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'TM6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'TM6-008', unitName: 'Develop Tour Packages' },
            { unitCode: 'TM6-009', unitName: 'Develop Travel Packages' },
            { unitCode: 'TM6-010', unitName: 'Manage Tour Delivery' },
            { unitCode: 'TM6-011', unitName: 'Manage Travel Service Delivery' },
            { unitCode: 'TM6-012', unitName: 'Market Tour and Travel Products' },
            { unitCode: 'TM6-013', unitName: 'Manage Customer Service' },
            { unitCode: 'TM6-014', unitName: 'Manage Tour and Travel Product Quality' },
            { unitCode: 'TM6-015', unitName: 'Manage Tour Office Operations' },
            { unitCode: 'TM6-016', unitName: 'Manage Travel Office Operations' },
            { unitCode: 'TM6-017', unitName: 'Promote Sustainable Tourism' },
            { unitCode: 'TM6-018', unitName: 'Intermediate Foreign Language Skills' },
            { unitCode: 'TM6-019', unitName: 'Tour and Travel Finance Management' },
            { unitCode: 'TM6-020', unitName: 'Responsible Tourism Promotion' },
            { unitCode: 'TM6-021', unitName: 'Tour Marketing' },
            { unitCode: 'TM6-022', unitName: 'Tourist Site Management' },
            { unitCode: 'TM6-023', unitName: 'Tour and Travel Operations' },
            { unitCode: 'TM6-024', unitName: 'Tourist Experience Management' },
            { unitCode: 'TM6-025', unitName: 'Industrial Attachment' }
        ]
    },

    // Hospitality Department
    'food_and_beverage_4': {
        department: 'hospitality',
        level: 4,
        units: [
            { unitCode: 'FB4-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'FB4-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'FB4-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'FB4-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'FB4-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'FB4-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'FB4-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'FB4-008', unitName: 'Prepare Yeast Products' },
            { unitCode: 'FB4-009', unitName: 'Prepare Sandwiches' },
            { unitCode: 'FB4-010', unitName: 'Cook Meats' },
            { unitCode: 'FB4-011', unitName: 'Prepare Salads and Salad Dressings' },
            { unitCode: 'FB4-012', unitName: 'Prepare Desserts' },
            { unitCode: 'FB4-013', unitName: 'Prepare Cuts of Meat' },
            { unitCode: 'FB4-014', unitName: 'Prepare Cakes' },
            { unitCode: 'FB4-015', unitName: 'Prepare Beverages' },
            { unitCode: 'FB4-016', unitName: 'Prepare Cereals, Vegetables, Fruits, and Nuts' },
            { unitCode: 'FB4-017', unitName: 'Prepare Eggs' },
            { unitCode: 'FB4-018', unitName: 'Prepare Food Accompaniments' },
            { unitCode: 'FB4-019', unitName: 'Prepare Main Dishes' },
            { unitCode: 'FB4-020', unitName: 'Prepare Soups' },
            { unitCode: 'FB4-021', unitName: 'Prepare Stocks and Sauces' }
        ]
    },

    'food_and_beverage_5': {
        department: 'hospitality',
        level: 5,
        units: [
            { unitCode: 'FB5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'FB5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'FB5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'FB5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'FB5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'FB5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'FB5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'FB5-008', unitName: 'Supervise Room Service Operations' },
            { unitCode: 'FB5-009', unitName: 'Manage Specialty Outlets' },
            { unitCode: 'FB5-010', unitName: 'Manage Food and Beverage Operations' },
            { unitCode: 'FB5-011', unitName: 'Perform Food and Beverage Department Administrative Duties' },
            { unitCode: 'FB5-012', unitName: 'Manage Bar Operations' },
            { unitCode: 'FB5-013', unitName: 'Manage Banquet and Event Operations' },
            { unitCode: 'FB5-014', unitName: 'Manage Food and Beverage Guest Experience' }
        ]
    },

    'food_and_beverage_6': {
        department: 'hospitality',
        level: 6,
        units: [
            { unitCode: 'FB6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'FB6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'FB6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'FB6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'FB6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'FB6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'FB6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'FB6-008', unitName: 'Manage Specialty Outlets' },
            { unitCode: 'FB6-009', unitName: 'Manage Room Service' },
            { unitCode: 'FB6-010', unitName: 'Manage Food and Beverage Operations' },
            { unitCode: 'FB6-011', unitName: 'Perform Food and Beverage Administrative Duties' },
            { unitCode: 'FB6-012', unitName: 'Manage Food and Beverage Guest Experience' },
            { unitCode: 'FB6-013', unitName: 'Manage Food and Beverages Revenue Performance' },
            { unitCode: 'FB6-014', unitName: 'Manage Bar Operations' },
            { unitCode: 'FB6-015', unitName: 'Manage Banquets and Events Services' }
        ]
    },

    'fashion_and_design_4': {
        department: 'hospitality',
        level: 4,
        units: [
            { unitCode: 'FD4-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'FD4-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'FD4-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'FD4-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'FD4-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'FD4-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'FD4-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'FD4-008', unitName: 'Perform Sewing Machine Operations' },
            { unitCode: 'FD4-009', unitName: 'Decorate Fabrics and Garments' },
            { unitCode: 'FD4-010', unitName: 'Sketch and Construct Garments' },
            { unitCode: 'FD4-011', unitName: 'Sketch and Construct Ladies\' Garments' }
        ]
    },

    'fashion_and_design_5': {
        department: 'hospitality',
        level: 5,
        units: [
            { unitCode: 'FD5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'FD5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'FD5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'FD5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'FD5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'FD5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'FD5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'FD5-008', unitName: 'Perform Sewing Machine Operations' },
            { unitCode: 'FD5-009', unitName: 'Design and Construct Garments' },
            { unitCode: 'FD5-010', unitName: 'Design and Decorate Fabrics' },
            { unitCode: 'FD5-011', unitName: 'Design and Construct Accessories' }
        ]
    },

    'fashion_and_design_6': {
        department: 'hospitality',
        level: 6,
        units: [
            { unitCode: 'FD6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'FD6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'FD6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'FD6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'FD6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'FD6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'FD6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'FD6-008', unitName: 'Design and Construct Bridal Wear' },
            { unitCode: 'FD6-009', unitName: 'Design and Construct Gents\' Wear' },
            { unitCode: 'FD6-010', unitName: 'Design and Construct Ladies Wear' },
            { unitCode: 'FD6-011', unitName: 'Design and Construct Lingerie' },
            { unitCode: 'FD6-012', unitName: 'Design and Construct Millinery' },
            { unitCode: 'FD6-013', unitName: 'Design and Construct Shoes' },
            { unitCode: 'FD6-014', unitName: 'Design and Construct Sports Wear' },
            { unitCode: 'FD6-015', unitName: 'Design and Construct Children\'s Wear' },
            { unitCode: 'FD6-016', unitName: 'Design and Decorate Fabrics' },
            { unitCode: 'FD6-017', unitName: 'Design and Construct Uniforms' },
            { unitCode: 'FD6-018', unitName: 'Design and Construct Fashion Accessories' },
            { unitCode: 'FD6-019', unitName: 'Design and Construct Bags' }
        ]
    },

    'hairdressing_4': {
        department: 'hospitality',
        level: 4,
        units: [
            { unitCode: 'HD4-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'HD4-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'HD4-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'HD4-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'HD4-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'HD4-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'HD4-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'HD4-008', unitName: 'Provide Barbering Services' },
            { unitCode: 'HD4-009', unitName: 'Provide Hair Addition Services' },
            { unitCode: 'HD4-010', unitName: 'Provide Hair Coloring Services' },
            { unitCode: 'HD4-011', unitName: 'Produce Hair Piece Products' },
            { unitCode: 'HD4-012', unitName: 'Provide Hair Setting and Styling Services' }
        ]
    },

    'hairdressing_5': {
        department: 'hospitality',
        level: 5,
        units: [
            { unitCode: 'HD5-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'HD5-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'HD5-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'HD5-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'HD5-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'HD5-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'HD5-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'HD5-008', unitName: 'Barbering Services' },
            { unitCode: 'HD5-009', unitName: 'Hair Cutting Services' },
            { unitCode: 'HD5-010', unitName: 'Hair Addition Services' },
            { unitCode: 'HD5-011', unitName: 'Hair Chemical Reformation Services' },
            { unitCode: 'HD5-012', unitName: 'Hair Colouring Services' },
            { unitCode: 'HD5-013', unitName: 'Hair Setting and Styling Services' },
            { unitCode: 'HD5-014', unitName: 'Hair Piece Production' },
            { unitCode: 'HD5-015', unitName: 'Industrial Attachment' }
        ]
    },

    'hairdressing_6': {
        department: 'hospitality',
        level: 6,
        units: [
            { unitCode: 'HD6-001', unitName: 'Demonstrate Communication Skills' },
            { unitCode: 'HD6-002', unitName: 'Demonstrate Numeracy Skills' },
            { unitCode: 'HD6-003', unitName: 'Demonstrate Digital Literacy' },
            { unitCode: 'HD6-004', unitName: 'Demonstrate Entrepreneurial Skills' },
            { unitCode: 'HD6-005', unitName: 'Demonstrate Employability Skills' },
            { unitCode: 'HD6-006', unitName: 'Demonstrate Environmental Literacy' },
            { unitCode: 'HD6-007', unitName: 'Demonstrate Occupational Safety and Health Practices' },
            { unitCode: 'HD6-008', unitName: 'Manage Barbering Operations' },
            { unitCode: 'HD6-009', unitName: 'Manage Hair Cutting Operations' },
            { unitCode: 'HD6-010', unitName: 'Manage Hair Addition Operations' },
            { unitCode: 'HD6-011', unitName: 'Manage Hair Chemical Reformation Operations' },
            { unitCode: 'HD6-012', unitName: 'Manage Hair Coloring Operations' },
            { unitCode: 'HD6-013', unitName: 'Manage Hair Setting and Styling Operations' },
            { unitCode: 'HD6-014', unitName: 'Manage Production of Hair Piece Products' },
            { unitCode: 'HD6-015', unitName: 'Manage Hairdressing Operations Unit' }
        ]
    }
};

module.exports = { courseUnits };