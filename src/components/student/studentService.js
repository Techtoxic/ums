// Student API Service

const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// Data refresh interval in milliseconds (5 minutes)
const REFRESH_INTERVAL = 5 * 60 * 1000;

// Store the refresh timer
let refreshTimer = null;

// Function to fetch student data by admission number and authenticate
async function fetchStudentData(admissionNumber, password) {
    try {
        // First verify the credentials
        const authResponse = await fetch(`${API_BASE_URL}/students/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admissionNumber,
                password
            })
        });

        if (authResponse.status === 401) {
            throw new Error('Invalid credentials. Please check your password.');
        }

        if (!authResponse.ok) {
            const errorData = await authResponse.json().catch(() => ({
                message: `Authentication error: ${authResponse.status} ${authResponse.statusText}`
            }));
            throw new Error(errorData.message || 'Authentication failed');
        }

        // After successful authentication, fetch student data
        const response = await fetch(`${API_BASE_URL}/students/${admissionNumber}`);
        if (response.status === 404) {
            throw new Error('Student not found. Please check the admission number.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                message: `Server error: ${response.status} ${response.statusText}`
            }));
            throw new Error(errorData.message || 'Failed to fetch student data');
        }

        const data = await response.json();
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid student data format received');
        }

        // Validate all required fields are present
        const requiredFields = ['name', 'idNumber', 'kcseGrade', 'admissionNumber', 'course', 'department', 'phoneNumber'];
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required student data fields: ${missingFields.join(', ')}`);
        }

        return data;
    } catch (error) {
        console.error('Error fetching student data:', error);
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Network error. Please check your internet connection.');
        }
        throw error;
    }
}

// Function to fetch student's financial information
async function fetchStudentFinances(admissionNumber) {
    try {
        const response = await fetch(`${API_BASE_URL}/students/${admissionNumber}/finances`);
        if (!response.ok) {
            throw new Error('Failed to fetch financial data');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching financial data:', error);
        throw error;
    }
}

// Function to fetch student's course information
async function fetchStudentCourses(admissionNumber) {
    try {
        const response = await fetch(`${API_BASE_URL}/students/${admissionNumber}/courses`);
        if (!response.ok) {
            throw new Error('Failed to fetch course data');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching course data:', error);
        throw error;
    }
}

// Function to start periodic data refresh
function startDataRefresh(admissionNumber, onDataUpdate) {
    // Clear any existing timer
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    // Function to refresh all student data
    const refreshData = async () => {
        try {
            const [studentData, financialData, courseData] = await Promise.all([
                fetchStudentData(admissionNumber),
                fetchStudentFinances(admissionNumber),
                fetchStudentCourses(admissionNumber)
            ]);

            // Store the updated data in sessionStorage
            const updatedData = {
                ...studentData,
                finances: financialData,
                courses: courseData,
                lastUpdated: new Date().toISOString()
            };
            sessionStorage.setItem('studentData', JSON.stringify(updatedData));

            // Call the callback if provided
            if (onDataUpdate) {
                onDataUpdate(updatedData);
            }
        } catch (error) {
            console.error('Error refreshing data:', error);
            // Don't throw here to prevent stopping the refresh cycle
        }
    };

    // Start the refresh cycle
    refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);

    // Initial refresh
    refreshData();
}

// Function to stop data refresh
function stopDataRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

// Export the service functions
export {
    fetchStudentData,
    fetchStudentFinances,
    fetchStudentCourses,
    startDataRefresh,
    stopDataRefresh
};