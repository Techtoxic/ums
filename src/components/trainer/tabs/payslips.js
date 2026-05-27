// tabs/payslips.js — trainer payslips: list, view, PDF download.
window.TrainerTabs = window.TrainerTabs || {};

// (verbatim from trainerDashboard.js)
let trainerPayslips = [];

// Load trainer payslips
async function loadTrainerPayslips() {
    try {
        showPayslipsLoading();
        
        if (!currentTrainer || !currentTrainer._id) {
            console.error('No trainer ID available');
            showPayslipsEmpty();
            return;
        }
        
        const response = await authFetch(`${API_BASE_URL}/trainers/${currentTrainer._id}/payslips`);
        if (!response.ok) throw new Error('Failed to load payslips');
        
        const data = await response.json();
        trainerPayslips = data.payslips || [];
        
        displayTrainerPayslips();
        updatePayslipBadge();
        hidePayslipsLoading();
        
    } catch (error) {
        console.error('Error loading payslips:', error);
        hidePayslipsLoading();
        showPayslipsEmpty();
    }
}

// Display trainer payslips
function displayTrainerPayslips() {
    const container = document.getElementById('payslips-list');
    const empty = document.getElementById('payslips-empty');
    
    if (!container) return;
    
    if (trainerPayslips.length === 0) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
    
    container.innerHTML = trainerPayslips.map(payslip => {
        const monthName = monthNames[parseInt(payslip.month)];
        const isUnread = !payslip.isViewed;
        
        return `
            <div class="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}" onclick="viewPayslip('${escapeAttr(payslip._id)}')">
                <div class="flex items-center justify-between cursor-pointer">
                    <div class="flex-1">
                        <div class="flex items-center space-x-3">
                            <div class="w-12 h-12 ${isUnread ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'} rounded-full flex items-center justify-center">
                                <i class="ri-file-text-line text-xl ${isUnread ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}"></i>
                            </div>
                            <div class="flex-1">
                                <div class="flex items-center space-x-2">
                                    <h3 class="font-semibold text-gray-900 dark:text-white ${isUnread ? 'font-bold' : ''}">${monthName} ${payslip.year} - Payslip</h3>
                                    ${isUnread ? '<span class="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">New</span>' : ''}
                                </div>
                                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    Amount: <span class="font-semibold text-gray-900 dark:text-white">KES ${Number(payslip.amount).toLocaleString()}</span>
                                </p>
                                ${payslip.description ? `<p class="text-xs text-gray-500 dark:text-gray-500 mt-1">${escapeHtml(payslip.description)}</p>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4">
                        <div class="text-right">
                            <p class="text-xs text-gray-500 dark:text-gray-500">Generated</p>
                            <p class="text-sm text-gray-700 dark:text-gray-300">${new Date(payslip.createdAt).toLocaleDateString()}</p>
                        </div>
                        <i class="ri-arrow-right-s-line text-2xl text-gray-400"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// View payslip details
async function viewPayslip(payslipId) {
    const payslip = trainerPayslips.find(p => p._id === payslipId);
    if (!payslip) return;
    
    // Mark as viewed
    if (!payslip.isViewed) {
        await markPayslipAsViewed(payslipId);
    }
    
    // Show payslip modal
    showPayslipModal(payslip);
}

// Show payslip modal
function showPayslipModal(payslip) {
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[parseInt(payslip.month)];
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div class="bg-gradient-to-r from-primary to-secondary text-white p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-bold">Payslip - ${monthName} ${payslip.year}</h2>
                        <p class="text-blue-100 mt-1">Salary Statement</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
            </div>
            
            <div class="p-6">
                <!-- Trainer Details -->
                <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Trainer Name</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${escapeHtml(payslip.trainerName)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Department</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${escapeHtml(formatDepartmentName(payslip.department))}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Period</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${monthName} ${payslip.year}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Generated Date</p>
                        <p class="font-semibold text-gray-900 dark:text-white">${new Date(payslip.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>
                
                ${payslip.description ? `
                    <div class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(payslip.description)}</p>
                    </div>
                ` : ''}
                
                <!-- Amount Details -->
                <div class="space-y-4 mb-6">
                    <div class="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Total Amount</p>
                            <p class="text-3xl font-bold text-green-600 dark:text-green-400">KES ${Number(payslip.amount).toLocaleString()}</p>
                        </div>
                        <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                            <i class="ri-money-dollar-circle-line text-3xl text-green-600 dark:text-green-400"></i>
                        </div>
                    </div>
                </div>
                
                <!-- Status -->
                <div class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center space-x-2">
                        <span class="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium rounded-full">
                            ${payslip.status || 'Active'}
                        </span>
                    </div>
                    <div class="flex space-x-3">
                        <button onclick="downloadPayslipPDF('${escapeAttr(payslip._id)}')" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center">
                            <i class="ri-download-line mr-2"></i>Download PDF
                        </button>
                        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Download payslip as PDF
function downloadPayslipPDF(payslipId) {
    const payslip = trainerPayslips.find(p => p._id === payslipId);
    if (!payslip) {
        showNotification('Payslip not found', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[parseInt(payslip.month)];
    
    // Colors
    const primaryColor = [122, 12, 12]; // #7A0C0C
    const secondaryColor = [139, 42, 42]; // #8B2A2A
    const textDark = [31, 41, 55];
    const textGray = [107, 114, 128];
    
    // Header - School Logo Area (Red background)
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 35, 'F');
    
    // School Name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('EMURUA DIKIRR TECHNICAL TRAINING INSTITUTE', 105, 12, { align: 'center' });
    
    // Contact Info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('P.O. Box 49, Emurua Dikirr - 20500', 105, 18, { align: 'center' });
    doc.text('Tel: +254 729 123 456 | Email: info@emurua-tech.ac.ke', 105, 23, { align: 'center' });
    doc.text('Website: www.emurua-tech.ac.ke', 105, 28, { align: 'center' });
    
    // ISO Certification
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('ISO 9001:2015 Certified Institution', 105, 33, { align: 'center' });
    
    // Horizontal line
    doc.setDrawColor(...secondaryColor);
    doc.setLineWidth(0.5);
    doc.line(10, 38, 200, 38);
    
    // Document Title
    doc.setTextColor(...textDark);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYSLIP', 105, 48, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${monthName} ${payslip.year}`, 105, 55, { align: 'center' });
    
    // Reference and Date
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    const refNumber = `EDTTI/PAYROLL/${payslip.year}/${payslip._id.substring(18)}`;
    doc.text(`Ref: ${refNumber}`, 15, 65);
    doc.text(`Date: ${new Date(payslip.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, 195, 65, { align: 'right' });
    
    // Line
    doc.setLineWidth(0.2);
    doc.line(15, 68, 195, 68);
    
    // Trainer Details Section
    doc.setFontSize(11);
    doc.setTextColor(...textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('TRAINER INFORMATION', 15, 78);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let yPos = 88;
    
    // Details in a box
    doc.setFillColor(249, 250, 251);
    doc.rect(15, 82, 180, 30, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.rect(15, 82, 180, 30);
    
    doc.setTextColor(...textGray);
    doc.setFont('helvetica', 'bold');
    doc.text('Name:', 20, yPos);
    doc.text('Department:', 20, yPos + 7);
    doc.text('Email:', 20, yPos + 14);
    doc.text('Period:', 20, yPos + 21);
    
    doc.setTextColor(...textDark);
    doc.setFont('helvetica', 'normal');
    doc.text(payslip.trainerName, 55, yPos);
    doc.text(formatDepartmentName(payslip.department), 55, yPos + 7);
    doc.text(payslip.email, 55, yPos + 14);
    doc.text(`${monthName} ${payslip.year}`, 55, yPos + 21);
    
    // Salary Details Section
    yPos = 125;
    doc.setFontSize(11);
    doc.setTextColor(...textDark);
    doc.setFont('helvetica', 'bold');
    doc.text('SALARY DETAILS', 15, yPos);
    
    // Salary breakdown table
    yPos = 135;
    
    // Table header
    doc.setFillColor(...primaryColor);
    doc.rect(15, yPos - 5, 180, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Description', 20, yPos);
    doc.text('Amount (KES)', 150, yPos);
    
    // Table rows
    yPos += 10;
    doc.setFillColor(255, 255, 255);
    doc.rect(15, yPos - 5, 180, 10, 'FD');
    doc.setTextColor(...textDark);
    doc.setFont('helvetica', 'normal');
    doc.text(payslip.description || 'Monthly Salary', 20, yPos);
    doc.text(Number(payslip.amount).toLocaleString(), 190, yPos, { align: 'right' });
    
    // Total
    yPos += 15;
    doc.setFillColor(240, 253, 244);
    doc.rect(15, yPos - 5, 180, 12, 'F');
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.5);
    doc.rect(15, yPos - 5, 180, 12);
    
    doc.setTextColor(5, 150, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL AMOUNT:', 20, yPos);
    doc.text(`KES ${Number(payslip.amount).toLocaleString()}`, 190, yPos, { align: 'right' });
    
    // Note Section
    yPos += 25;
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    doc.setFont('helvetica', 'italic');
    doc.text('This is a computer-generated payslip and requires no signature.', 105, yPos, { align: 'center' });
    
    yPos += 5;
    doc.text('For any queries, please contact the Finance Office.', 105, yPos, { align: 'center' });
    
    // Footer
    yPos = 270;
    doc.setLineWidth(0.2);
    doc.setDrawColor(...textGray);
    doc.line(15, yPos, 195, yPos);
    
    yPos += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is an official document from Emurua Dikirr Technical Training Institute', 15, yPos);
    doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')} | ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 195, yPos, { align: 'right' });
    
    // Save the PDF
    const fileName = `EDTTI_Payslip_${payslip.trainerName.replace(/\s+/g, '_')}_${monthName}_${payslip.year}.pdf`;
    doc.save(fileName);
    
    // Show success notification
    showNotification('Payslip downloaded successfully', 'success');
}

// Mark payslip as viewed
async function markPayslipAsViewed(payslipId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/payslips/${payslipId}/view`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) throw new Error('Failed to mark payslip as viewed');
        
        // Update local state
        const payslip = trainerPayslips.find(p => p._id === payslipId);
        if (payslip) {
            payslip.isViewed = true;
        }
        
        // Refresh display
        displayTrainerPayslips();
        updatePayslipBadge();
        
    } catch (error) {
        console.error('Error marking payslip as viewed:', error);
    }
}

// Update payslip badge
function updatePayslipBadge() {
    const unreadCount = trainerPayslips.filter(p => !p.isViewed).length;
    const badge = document.getElementById('payslip-unread-badge');
    
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// Show/hide payslips loading
function showPayslipsLoading() {
    const loading = document.getElementById('payslips-loading');
    const list = document.getElementById('payslips-list');
    const empty = document.getElementById('payslips-empty');
    
    if (loading) loading.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
}

function hidePayslipsLoading() {
    const loading = document.getElementById('payslips-loading');
    const list = document.getElementById('payslips-list');
    
    if (loading) loading.classList.add('hidden');
    if (list) list.classList.remove('hidden');
}

function showPayslipsEmpty() {
    const empty = document.getElementById('payslips-empty');
    if (empty) empty.classList.remove('hidden');
}

// Refresh payslips
async function refreshPayslips() {
    await loadTrainerPayslips();
    showNotification('Payslips refreshed', 'success');
}

window.TrainerTabs.payslips = {
    init() {
        currentSection = 'payslips';
        loadTrainerPayslips();
    }
};
