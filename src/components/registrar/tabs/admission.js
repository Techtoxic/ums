// tabs/admission.js — Student Admission landing page.
//
// Shows quick stats (next admission #, total students, admitted today, latest
// admission #) and the most recent admissions. The actual registration is
// performed via the global admission modal (openAdmissionModal in portal-core.js).
window.RegistrarTabs = window.RegistrarTabs || {};

async function loadAdmissionTabData() {
    try {
        const [studentsRes, nextRes] = await Promise.all([
            window.AUTH.fetch(`${API_BASE_URL}/students`),
            window.AUTH.fetch(`${API_BASE_URL}/students/next-admission-number`),
        ]);

        let students = [];
        if (studentsRes.ok) {
            const body = await studentsRes.json();
            students = Array.isArray(body) ? body : [];
        }

        let nextAdmission = '—';
        if (nextRes.ok) {
            const nb = await nextRes.json();
            nextAdmission = nb.nextAdmissionNumber || '—';
        }

        const totalEl = document.getElementById('admissionTabTotalStudents');
        const nextEl = document.getElementById('admissionTabNextNumber');
        const todayEl = document.getElementById('admissionTabToday');
        const latestEl = document.getElementById('admissionTabLatestNumber');

        if (totalEl) totalEl.textContent = students.length.toLocaleString();
        if (nextEl) nextEl.textContent = nextAdmission;

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const admittedToday = students.filter(s => {
            if (!s.createdAt) return false;
            const d = new Date(s.createdAt);
            return d >= today;
        });
        if (todayEl) todayEl.textContent = admittedToday.length.toLocaleString();

        const sorted = students.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        if (latestEl) latestEl.textContent = (sorted[0] && sorted[0].admissionNumber) || '—';

        const tbody = document.getElementById('recentAdmissionsBody');
        if (tbody) {
            const recent = sorted.slice(0, 10);
            if (!recent.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-center text-gray-500">No admissions yet.</td></tr>';
            } else {
                tbody.innerHTML = recent.map(s => {
                    const created = s.createdAt ? new Date(s.createdAt).toLocaleString() : '—';
                    return `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td class="px-3 py-3 text-sm font-mono">${escapeHtml(s.admissionNumber || '')}</td>
                            <td class="px-3 py-3 text-sm">${escapeHtml(s.name || '')}</td>
                            <td class="px-3 py-3 text-sm">${escapeHtml(String(s.course || '').replace(/_/g, ' '))}</td>
                            <td class="px-3 py-3 text-sm">Module ${s.module ?? '-'}</td>
                            <td class="px-3 py-3 text-sm">${escapeHtml(s.intake || '')} ${escapeHtml(String(s.intakeYear || ''))}</td>
                            <td class="px-3 py-3 text-sm">${escapeHtml(created)}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        console.error('Error loading admission tab data:', err);
        const tbody = document.getElementById('recentAdmissionsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-center text-red-500">Failed to load admissions.</td></tr>';
    }
}

window.RegistrarTabs.admission = {
    init() {
        loadAdmissionTabData();
    },
};
