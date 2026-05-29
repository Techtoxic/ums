// tabs/financial.js — financial tab: program cost + balance breakdown.

window.StudentTabs = window.StudentTabs || {};

window.StudentTabs.financial = {
    async init() {
        // Populate the program-details block (course, department, module, etc.)
        // on first paint. Previously this only ran on the dashboard tab, so the
        // financial tab's details stayed "Loading..." until the user visited
        // another tab and came back. Run it here so the data is correct on the
        // very first visit.
        updateStudentInfo();

        const courseKey = studentData.course;
        let programCost = null;
        if (courseKey) {
            programCost = await fetchProgramCost(courseKey);
            updateProgramCost(programCost);
        } else {
            updateProgramCost(null);
        }
        const admissionNumber = studentData.admissionNumber;
        const payments = admissionNumber ? await fetchStudentPayments(admissionNumber) : [];
        await updateFinancialInfo(programCost, payments);
    }
};
