// tabs/payments.js — payments tab: history list + receipt modal (PDF export/print).

window.StudentTabs = window.StudentTabs || {};

// (verbatim from studentPortal.js)
// Update payment history display
function updatePaymentHistory(payments) {
    const paymentHistoryContainer = document.getElementById('payment-history');
    if (!paymentHistoryContainer) return;
    
    if (!payments || payments.length === 0) {
        paymentHistoryContainer.innerHTML = `
            <div class="text-center py-8">
                <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="ri-receipt-line text-2xl text-gray-400"></i>
                </div>
                <p class="text-gray-600 dark:text-gray-400">No payment history available</p>
            </div>
        `;
        return;
    }
    
    const paymentHTML = payments.map((payment, index) => `
        <div class="payment-item flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors" data-payment='${escapeAttr(JSON.stringify(payment))}'>
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <i class="ri-check-line text-green-600"></i>
                </div>
                <div>
                    <p class="font-medium text-gray-800 dark:text-white">${formatCurrency(payment.amount)}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'Date not available'}
                    </p>
                </div>
            </div>
            <div class="text-right flex items-center gap-2">
                <span class="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                    ${payment.paymentMode === 'mpesa' ? 'M-Pesa' : payment.paymentMode === 'bank' ? 'Bank' : 'Payment'}
                </span>
                <i class="ri-receipt-line text-gray-400 text-sm"></i>
            </div>
        </div>
    `).join('');
    
    paymentHistoryContainer.innerHTML = paymentHTML;
    
    // Add click event listeners to payment items
    document.querySelectorAll('.payment-item').forEach(item => {
        item.addEventListener('click', () => {
            const paymentData = JSON.parse(item.getAttribute('data-payment'));
            showPaymentReceipt(paymentData);
        });
    });
}

// Show payment receipt modal
function showPaymentReceipt(payment) {
    const modal = document.getElementById('receipt-modal');
    const content = document.getElementById('receipt-content');
    
    if (!modal || !content) return;
    
    // Generate receipt content
    const receiptHTML = `
        <div class="space-y-4">
            <div class="text-center pb-4 border-b border-gray-200 dark:border-gray-700">
                <div class="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="ri-receipt-line text-white text-2xl"></i>
                </div>
                <h4 class="text-lg font-semibold text-gray-800 dark:text-white">Payment Receipt</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">EDTTI - Emura Technical Training Institute</p>
            </div>
            
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Student:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${escapeHtml(studentData.name || 'N/A')}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Admission Number:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${escapeHtml(studentData.admissionNumber || 'N/A')}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Amount Paid:</span>
                    <span class="font-semibold text-green-600 text-lg">${formatCurrency(payment.amount)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Payment Method:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.paymentMode === 'mpesa' ? 'M-Pesa' : payment.paymentMode === 'bank' ? 'Bank Transfer' : 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Reference:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${escapeHtml(payment.reference || 'N/A')}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Date:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : 'N/A'}</span>
                </div>
                ${payment.paymentMode === 'bank' && payment.bankName ? `
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Bank:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${escapeHtml(payment.bankName)}</span>
                </div>` : ''}
                ${payment.receiptNumber ? `
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Receipt Number:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${escapeHtml(payment.receiptNumber)}</span>
                </div>` : ''}
            </div>
            
            <div class="pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
                <p class="text-xs text-gray-500 dark:text-gray-400">
                    Generated on ${new Date().toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            </div>
        </div>
    `;
    
    content.innerHTML = receiptHTML;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Store payment data for export
    modal.setAttribute('data-payment', JSON.stringify(payment));
}

// Close receipt modal
function closeReceiptModal() {
    const modal = document.getElementById('receipt-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Export receipt as PDF (branded EDTTI letterhead with school logo)
async function exportReceipt() {
    const modal = document.getElementById('receipt-modal');
    const paymentData = JSON.parse(modal.getAttribute('data-payment') || '{}');
    
    try {
        // Use same jsPDF access method as registrar dashboard
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Branded letterhead (logo + maroon/gold) — consistent with finance docs.
        let yPos = 55;
        if (window.EDTTIDocs) {
            try {
                await window.EDTTIDocs.loadLogo();
                yPos = window.EDTTIDocs.letterhead(doc, { title: 'Payment Receipt' }) + 6;
            } catch (e) {
                yPos = 55;
            }
        } else {
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text('EDTTI - Payment Receipt', 105, 20, { align: 'center' });
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text('Emurua Dikirr Technical Training Institute', 105, 30, { align: 'center' });
            doc.line(20, 40, 190, 40);
        }
        
        // Receipt details
        doc.setFontSize(11);
        doc.setTextColor(31, 41, 55);
        
        const details = [
            ['Student Name:', studentData.name || 'N/A'],
            ['Admission Number:', studentData.admissionNumber || 'N/A'],
            ['Amount Paid:', formatCurrency(paymentData.amount)],
            ['Payment Method:', paymentData.paymentMode === 'mpesa' ? 'M-Pesa' : paymentData.paymentMode === 'bank' ? 'Bank Transfer' : 'N/A'],
            ['Reference/Transaction ID:', paymentData.reference || 'N/A'],
            ['Payment Date:', paymentData.paymentDate ? new Date(paymentData.paymentDate).toLocaleDateString() : 'N/A']
        ];
        
        if (paymentData.paymentMode === 'bank' && paymentData.bankName) {
            details.push(['Bank:', paymentData.bankName]);
        }
        
        if (paymentData.receiptNumber) {
            details.push(['Receipt Number:', paymentData.receiptNumber]);
        }
        
        details.forEach(([label, value]) => {
            doc.setFont(undefined, 'bold');
            doc.text(label, 20, yPos);
            doc.setFont(undefined, 'normal');
            doc.text(value, 80, yPos);
            yPos += 8;
        });
        
        // Footer
        yPos += 15;
        doc.line(20, yPos, 190, yPos);
        yPos += 10;
        doc.setFontSize(9);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yPos);
        doc.text('This is an official payment receipt.', 105, yPos + 8, { align: 'center' });
        
        // Save the PDF
        const fileName = `payment-receipt-${paymentData.reference || Date.now()}.pdf`;
        doc.save(fileName);
    } catch (error) {
        console.error('PDF generation failed:', error);
        alert('Unable to generate PDF. Please ensure you have a stable internet connection and try again.');
    }
}



// Print receipt
function printReceipt() {
    const content = document.getElementById('receipt-content');
    if (!content) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Receipt</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .receipt { max-width: 400px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 20px; }
                .details { margin: 10px 0; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; }
                .amount { font-size: 18px; font-weight: bold; color: #059669; }
            </style>
        </head>
        <body>
            <div class="receipt">
                ${content.innerHTML}
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
}

window.StudentTabs.payments = {
    async init() {
        const admissionNumber = studentData.admissionNumber;
        const payments = admissionNumber ? await fetchStudentPayments(admissionNumber) : [];
        updatePaymentHistory(payments);
    }
};
