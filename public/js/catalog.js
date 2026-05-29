/**
 * Shared catalog helper — single source of programs + departments for every
 * portal (Rule 7: no hardcoded course/department lists in the frontend).
 *
 * Loads /api/programs and /api/departments once, caches them, and exposes
 * lookups + dropdown populators. Programs are keyed by CODE (e.g. 'GA5'); that
 * code is the universal course identifier stored on student.course. Departments
 * carry a snake_case `textCode` (e.g. 'applied_science') which is the value
 * stored on student.department / users.department and used by SQL joins.
 *
 * Convention matches public/js/auth.js + config.js: IIFE attaching to window.
 * Must be loaded AFTER config.js (for APP_CONFIG) and auth.js (for escapeHtml).
 */
(function (window) {
    'use strict';

    const API = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
        || (window.location.origin + '/api');

    let _programs = null, _departments = null;
    let _programsPromise = null, _departmentsPromise = null;
    let _byCode = null, _deptByText = null;

    async function _fetchJson(path) {
        const res = await fetch(API + path, { credentials: 'include' });
        if (!res.ok) throw new Error('Catalog fetch failed: ' + path + ' (' + res.status + ')');
        return res.json();
    }

    function _esc(s) {
        return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
    }

    function _titleCase(s) {
        return String(s || '')
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    async function loadPrograms(force) {
        if (_programs && !force) return _programs;
        if (!_programsPromise || force) {
            _programsPromise = _fetchJson('/programs')
                .then((list) => {
                    _programs = Array.isArray(list) ? list.filter((p) => p && p.isActive !== false) : [];
                    _byCode = {};
                    for (const p of _programs) if (p.code) _byCode[String(p.code).toUpperCase()] = p;
                    return _programs;
                })
                .catch((err) => { console.error(err); _programs = []; _byCode = {}; return []; });
        }
        return _programsPromise;
    }

    async function loadDepartments(force) {
        if (_departments && !force) return _departments;
        if (!_departmentsPromise || force) {
            _departmentsPromise = _fetchJson('/departments')
                .then((list) => {
                    _departments = Array.isArray(list) ? list : [];
                    _deptByText = {};
                    for (const d of _departments) if (d.textCode) _deptByText[d.textCode] = d;
                    return _departments;
                })
                .catch((err) => { console.error(err); _departments = []; _deptByText = {}; return []; });
        }
        return _departmentsPromise;
    }

    /** Resolve programs + departments before using the sync lookups below. */
    async function ready() {
        await Promise.all([loadPrograms(), loadDepartments()]);
        return true;
    }

    /** 'GA5' (or 'ga5') → program object, or null. */
    function programByCode(code) {
        if (!code || !_byCode) return null;
        return _byCode[String(code).toUpperCase()] || null;
    }

    /** A course value (program code, e.g. 'GA5') → human program name.
     *  Falls back to a title-cased version of the raw value for legacy/unknown. */
    function formatCourseName(courseOrCode) {
        if (!courseOrCode) return '';
        const p = programByCode(courseOrCode);
        if (p) return p.name;
        return _titleCase(courseOrCode);
    }

    /** snake_case department key (e.g. 'applied_science') → display name. */
    function departmentName(key) {
        if (!key) return '';
        if (_deptByText && _deptByText[key]) return _deptByText[key].name;
        return _titleCase(key);
    }

    /** { departmentTextCode: [program, ...] } for building grouped dropdowns. */
    function programsByDepartment() {
        const out = {};
        for (const p of (_programs || [])) {
            const key = p.departmentCode || p.departmentName || 'other';
            (out[key] = out[key] || []).push(p);
        }
        return out;
    }

    /** Fill a <select> with department options. Values are snake_case textCodes
     *  so existing joins/filters keep working. */
    function populateDepartmentSelect(selectEl, opts) {
        if (!selectEl) return;
        opts = opts || {};
        const includeAll = !!opts.includeAll;
        const allLabel = opts.allLabel || 'All Departments';
        const selected = opts.selected != null ? String(opts.selected) : null;
        const depts = (_departments || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        let html = '';
        if (includeAll) html += '<option value="">' + _esc(allLabel) + '</option>';
        for (const d of depts) {
            const val = d.textCode || d.code;
            const sel = (selected !== null && selected === String(val)) ? ' selected' : '';
            html += '<option value="' + _esc(val) + '"' + sel + '>' + _esc(d.name) + '</option>';
        }
        selectEl.innerHTML = html;
    }

    /** Fill a <select> with course options. Option value is the program CODE.
     *  grouped:true builds <optgroup> by department. */
    function populateCourseSelect(selectEl, opts) {
        if (!selectEl) return;
        opts = opts || {};
        const grouped = opts.grouped !== false;
        const includeBlank = opts.includeBlank !== false;
        const blankLabel = opts.blankLabel || 'Select a course';
        const selected = opts.selected != null ? String(opts.selected).toUpperCase() : null;

        const optionFor = (p) => {
            const sel = (selected !== null && selected === String(p.code).toUpperCase()) ? ' selected' : '';
            return '<option value="' + _esc(p.code) + '"' + sel + '>' + _esc(p.name) + ' (' + _esc(p.code) + ')</option>';
        };

        let html = '';
        if (includeBlank) html += '<option value="">' + _esc(blankLabel) + '</option>';

        if (grouped) {
            const byDept = programsByDepartment();
            const groups = Object.keys(byDept).map((k) => {
                const sample = byDept[k][0];
                const label = (sample && sample.departmentName) || departmentName(k) || k;
                return { label: label, programs: byDept[k] };
            }).sort((a, b) => a.label.localeCompare(b.label));
            for (const g of groups) {
                const progs = g.programs.slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
                html += '<optgroup label="' + _esc(g.label) + '">';
                for (const p of progs) html += optionFor(p);
                html += '</optgroup>';
            }
        } else {
            const progs = (_programs || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
            for (const p of progs) html += optionFor(p);
        }
        selectEl.innerHTML = html;
    }

    window.Catalog = {
        loadPrograms: loadPrograms,
        loadDepartments: loadDepartments,
        ready: ready,
        programByCode: programByCode,
        formatCourseName: formatCourseName,
        departmentName: departmentName,
        programsByDepartment: programsByDepartment,
        getPrograms: function () { return (_programs || []).slice(); },
        getDepartments: function () { return (_departments || []).slice(); },
        populateCourseSelect: populateCourseSelect,
        populateDepartmentSelect: populateDepartmentSelect,
    };
})(window);
