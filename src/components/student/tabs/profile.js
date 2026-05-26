// tabs/profile.js — profile tab: renders identity fields from studentData.

window.StudentTabs = window.StudentTabs || {};

window.StudentTabs.profile = {
    // The email-update modal + its handlers live in portal-core.js (shell modal).
    init() {
        updateStudentInfo();
    }
};
