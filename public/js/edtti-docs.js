// edtti-docs.js — shared branded document engine for all EDTTI portals.
//
// Provides a consistent, production-grade look for every generated document
// (finance reports, fee slips, analytics, admission letters, exports):
//   - the school logo (background already removed) + maroon/gold letterhead
//   - "OFFICIAL · EDTTI" watermark + page footer
//   - a generic branded autoTable report builder
//   - PDF + Excel (.xls) exporters ONLY (no CSV)
//
// Requires jsPDF + jspdf-autotable to be loaded on the page (the portal shells
// load them from CDN). Chart.js is optional and only used by callers.
window.EDTTIDocs = (function () {
    const MAROON = [122, 12, 12];
    const GOLD = [212, 160, 23];
    const CREAM = [250, 244, 232];
    const INSTITUTION = 'EMURUA DIKIRR TECHNICAL TRAINING INSTITUTE';
    // Global header block — kept identical on every generated PDF (item 1).
    const ADDRESS = 'P.O. Box 49, Emurua Dikirr - 20500';
    const CONTACT = 'Tel: +254 729 123 456   |   Email: info@emurua-tech.ac.ke';
    const WEB_ISO = 'Website: www.emurua-tech.ac.ke   |   ISO 9001:2015 Certified Institution';

    let logoDataUrl = null;
    let logoPromise = null;

    // Load + cache the logo as a dataURL so jsPDF.addImage can embed it.
    function loadLogo() {
        if (logoDataUrl) return Promise.resolve(logoDataUrl);
        if (logoPromise) return logoPromise;
        logoPromise = fetch('/public/img/logo.png')
            .then(r => (r.ok ? r.blob() : null))
            .then(blob => blob ? new Promise((resolve) => {
                const fr = new FileReader();
                fr.onloadend = () => { logoDataUrl = fr.result; resolve(logoDataUrl); };
                fr.onerror = () => resolve(null);
                fr.readAsDataURL(blob);
            }) : null)
            .catch(() => null);
        return logoPromise;
    }
    // Kick off the load immediately so the logo is usually ready by export time.
    loadLogo();

    function formatKES(n) { return `KES ${Math.round(Number(n) || 0).toLocaleString()}`; }

    // Draw the letterhead (logo + institution + title) and return the y to
    // continue from. Call AFTER loadLogo() has resolved for the logo to appear.
    function letterhead(doc, opts = {}) {
        const pw = doc.internal.pageSize.getWidth();
        if (logoDataUrl) {
            try { doc.addImage(logoDataUrl, 'PNG', 14, 8, 22, 20); } catch (e) { /* ignore */ }
        }
        // Institution name (the only maroon element in the header text block).
        doc.setTextColor.apply(doc, MAROON);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(opts.landscape ? 15 : 14);
        doc.text(INSTITUTION, pw / 2, 13, { align: 'center' });
        // Consistent global contact / ISO block.
        doc.setTextColor(90, 90, 90);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(ADDRESS, pw / 2, 18, { align: 'center' });
        doc.text(CONTACT, pw / 2, 22, { align: 'center' });
        doc.text(WEB_ISO, pw / 2, 26, { align: 'center' });
        let lineY = 30;
        if (opts.title) {
            doc.setTextColor.apply(doc, MAROON);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(String(opts.title).toUpperCase(), pw / 2, 32, { align: 'center' });
            lineY = 36;
        }
        doc.setDrawColor.apply(doc, GOLD);
        doc.setLineWidth(0.8);
        doc.line(14, lineY, pw - 14, lineY);
        let y = lineY + 6;
        doc.setTextColor(70, 70, 70);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        if (opts.subtitle) { doc.text(String(opts.subtitle), 14, y); }
        doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pw - 14, y, { align: 'right' });
        return y + 6;
    }

    function decorate(doc, opts = {}) {
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            // Watermark — use a real alpha channel (GState) when the jsPDF build
            // supports it so the opacity is consistent and faint enough to read
            // through; fall back to a pale tint on older builds. Always reset
            // alpha afterwards so the footer/body stay fully opaque.
            const hasGState = typeof doc.GState === 'function';
            if (hasGState) {
                try { doc.setGState(new doc.GState({ opacity: 0.07 })); } catch (e) { /* */ }
                doc.setTextColor.apply(doc, MAROON);
            } else {
                doc.setTextColor(238, 232, 220);
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(54);
            doc.text('OFFICIAL · EDTTI', pw / 2, ph / 2, { align: 'center', angle: 30 });
            if (hasGState) { try { doc.setGState(new doc.GState({ opacity: 1 })); } catch (e) { /* */ } }
            // footer
            doc.setTextColor(110, 110, 110);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.text(opts.footer || 'EDTTI University Management System · Confidential', 14, ph - 7);
            doc.text(`Page ${i} of ${pages}`, pw - 14, ph - 7, { align: 'right' });
        }
    }

    function lockDocument(doc) {
        try {
            const ownerPwd = `EDTTI-LOCK-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            doc.setEncryption('', ownerPwd, { printing: 'highResolution', modifying: false, copying: true, annotating: false });
        } catch (e) { /* older jsPDF builds */ }
    }

    function newDoc(landscape) {
        const { jsPDF } = window.jspdf;
        return new jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'mm', format: 'a4' });
    }

    // Generic branded report: title + optional KPI summary rows + a table.
    async function tablePDF(opts = {}) {
        await loadLogo();
        const doc = newDoc(opts.landscape);
        doc.setProperties({ title: opts.title || 'EDTTI Report', author: 'EDTTI UMS', creator: 'EDTTI UMS' });
        let y = letterhead(doc, { title: opts.title, subtitle: opts.subtitle, landscape: opts.landscape });

        if (Array.isArray(opts.summary) && opts.summary.length) {
            doc.autoTable({
                body: opts.summary,
                startY: y,
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 1.2 },
                columnStyles: { 0: { fontStyle: 'bold', textColor: MAROON, cellWidth: 70 } },
                margin: { left: 14, right: 14 },
            });
            y = doc.lastAutoTable.finalY + 6;
        }

        if (opts.columns && opts.rows) {
            doc.autoTable({
                head: [opts.columns],
                body: opts.rows,
                startY: y,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: MAROON, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: CREAM },
                margin: { left: 10, right: 10 },
            });
        }
        decorate(doc, { footer: opts.footer });
        lockDocument(doc);
        doc.save(opts.filename || 'edtti_report.pdf');
    }

    // Finance analytics PDF: KPI summary + department table.
    async function analyticsPDF(data) {
        const t = data.totals || {};
        const summary = [
            ['Total Revenue', formatKES(t.totalRevenue)],
            ['Tuition Revenue', formatKES(t.tuitionRevenue)],
            ['Other (Non-Tuition) Revenue', formatKES(t.otherRevenue)],
            ['Expected Tuition', formatKES(t.expectedRevenue)],
            ['Outstanding Balance', formatKES(t.outstandingBalance)],
            ['Collection Rate', `${t.collectionRate || 0}%`],
            ['Students', `${t.studentsTotal || 0} (fully paid ${t.fullyPaid || 0}, with balance ${t.withBalance || 0})`],
        ];
        const columns = ['Department', 'Students', 'Expected', 'Collected', 'Outstanding'];
        const rows = (data.departmentBreakdown || []).map(d => [
            d.departmentName, String(d.students), formatKES(d.expected), formatKES(d.actual), formatKES(d.outstanding),
        ]);
        return tablePDF({
            title: 'Finance Analytics Report',
            subtitle: 'Live figures from payment, revenue & student records',
            summary, columns, rows,
            filename: `finance_analytics_${new Date().toISOString().slice(0, 10)}.pdf`,
            footer: 'EDTTI UMS — Finance Analytics · Confidential',
        });
    }

    // Excel (.xls) export via an HTML table workbook — Excel opens it natively.
    // No CSV anywhere (per spec). `rows` is an array of arrays; the first row(s)
    // can be titles. `filename` is given WITHOUT extension.
    function downloadExcel(rows, filename) {
        const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const body = rows.map(r => {
            if (!Array.isArray(r)) r = [r];
            return '<tr>' + r.map(c => {
                const num = typeof c === 'number';
                return `<td style="${num ? '' : 'mso-number-format:\\@;'}">${esc(c)}</td>`;
            }).join('') + '</tr>';
        }).join('');
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>EDTTI</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table border="1">${body}</table></body></html>`;
        const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${filename}.xls`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return { loadLogo, letterhead, decorate, lockDocument, newDoc, tablePDF, analyticsPDF, downloadExcel, formatKES, MAROON, GOLD, CREAM, INSTITUTION, ADDRESS, CONTACT, WEB_ISO };
})();

// Back-compat alias used by finance tabs.
window.FinanceDocs = window.EDTTIDocs;
