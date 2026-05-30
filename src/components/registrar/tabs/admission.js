// tabs/admission.js — Student Admission landing page.
//
// Shows quick stats (next admission #, total students, admitted today, latest
// admission #) and the most recent admissions. The actual registration is
// performed via the global admission modal (openAdmissionModal in portal-core.js).
window.RegistrarTabs = window.RegistrarTabs || {};

async function loadAdmissionTabData() {
    try {
        // Stats + recent students fetched in parallel. The "next admission #"
        // preview here is the raw global number (no course/intake context),
        // which doubles as the canonical counter value on the registrar
        // landing page; the full COURSE/SEQ/INTAKE preview appears inside the
        // admission modal once a course and intake are selected.
        const [statsRes, recentRes, nextRes] = await Promise.all([
            window.AUTH.fetch(`${API_BASE_URL}/students/stats`),
            window.AUTH.fetch(`${API_BASE_URL}/students?page=1&limit=10`),
            window.AUTH.fetch(`${API_BASE_URL}/students/next-admission-number`),
        ]);

        let stats = null;
        if (statsRes.ok) stats = await statsRes.json();

        let recent = [];
        if (recentRes.ok) {
            const body = await recentRes.json();
            recent = Array.isArray(body && body.students) ? body.students : (Array.isArray(body) ? body : []);
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

        if (totalEl) totalEl.textContent = stats ? (stats.totalStudents || 0).toLocaleString() : '—';
        if (nextEl) nextEl.textContent = nextAdmission;
        if (todayEl) todayEl.textContent = stats ? (stats.studentsAdmittedToday || 0).toLocaleString() : '—';
        if (latestEl) latestEl.textContent = stats && stats.latestAdmissionNumber ? stats.latestAdmissionNumber : '—';

        const tbody = document.getElementById('recentAdmissionsBody');
        if (tbody) {
            if (!recent.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-center text-gray-500">No admissions yet.</td></tr>';
            } else {
                tbody.innerHTML = recent.map(s => {
                    const created = s.createdAt ? new Date(s.createdAt).toLocaleString() : '—';
                    const courseLabel = s.courseName || (typeof formatCourseName === 'function' ? formatCourseName(s.course) : (s.course || ''));
                    return `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td class="px-3 py-3 text-sm font-mono">${escapeHtml(s.admissionNumber || '')}</td>
                            <td class="px-3 py-3 text-sm">${escapeHtml(s.name || '')}</td>
                            <td class="px-3 py-3 text-sm">${escapeHtml(courseLabel || '')}</td>
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
