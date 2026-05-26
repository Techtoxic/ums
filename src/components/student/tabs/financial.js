// tabs/financial.js — financial tab: program cost + balance breakdown.

window.StudentTabs = window.StudentTabs || {};

window.StudentTabs.financial = {
    async init() {
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
