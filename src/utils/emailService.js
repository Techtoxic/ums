// Transactional email via Brevo's HTTP API (https://api.brevo.com).
// Replaces the previous nodemailer/Gmail SMTP transport: the staging
// droplet blocks outbound SMTP (465/587), so we send over HTTPS (443).
// Uses Node 20's built-in global fetch + AbortController — no extra deps.
const config = require('../config/config');

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_ACCOUNT_URL = 'https://api.brevo.com/v3/account';
const REQUEST_TIMEOUT_MS = 15000;

// Single point of HTTP contact with Brevo. Always clears its timeout.
// Returns { ok, status, json } and never throws on non-2xx; only network
// failures / aborts reject (callers handle those).
async function brevoFetch(url, { apiKey, method = 'GET', body }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method,
            signal: controller.signal,
            headers: {
                'api-key': apiKey,
                'content-type': 'application/json',
                'accept': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });
        let json = null;
        try { json = await res.json(); } catch (_) { json = null; }
        return { ok: res.ok, status: res.status, json };
    } finally {
        clearTimeout(timer);
    }
}

// Shared send path for every public send* method. Resolves (never throws)
// so callers can keep awaiting without try/catch obligations.
// Logging never includes the api key, request body, recipient address,
// OTP value, or reset token.
async function sendEmail(service, { subject, htmlContent, textContent, recipientEmail, recipientName, recipients }) {
    if (!service.apiKey) {
        console.log('email skipped: BREVO_API_KEY not set');
        return { success: true, skipped: true };
    }

    // Single recipient (recipientEmail) or many (recipients: array of addresses).
    const to = Array.isArray(recipients) && recipients.length
        ? recipients.map((email) => ({ email }))
        : [{ email: recipientEmail, name: recipientName || recipientEmail }];

    const payload = {
        sender: { name: service.senderName, email: service.senderEmail },
        to,
        subject,
        htmlContent
    };
    if (textContent) payload.textContent = textContent;

    try {
        const { ok, status, json } = await brevoFetch(BREVO_SEND_URL, {
            apiKey: service.apiKey,
            method: 'POST',
            body: payload
        });

        if (ok && json && json.messageId) {
            console.log(`Email sent: ${subject} [${json.messageId}]`);
            return { success: true, messageId: json.messageId, recipient: recipientEmail || recipients };
        }

        const code = (json && json.code) ? json.code : 'unknown';
        console.error(`Email failed: ${subject} | status=${status} code=${code}`);
        return { success: false, error: `brevo responded ${status}` };
    } catch (err) {
        const isTimeout = err && err.name === 'AbortError';
        const status = isTimeout ? 'timeout' : 'network';
        const code = isTimeout ? 'TIMEOUT' : ((err && err.code) ? err.code : 'NETWORK');
        console.error(`Email failed: ${subject} | status=${status} code=${code}`);
        return { success: false, error: isTimeout ? 'request timeout' : 'network error' };
    }
}

class EmailService {
    constructor() {
        this.apiKey = process.env.BREVO_API_KEY || null;
        this.senderEmail = process.env.BREVO_SENDER_EMAIL || null;
        this.senderName = process.env.BREVO_SENDER_NAME || null;
        this.initializeTransporter();
    }

    initializeTransporter() {
        if (!this.apiKey) {
            console.warn('BREVO_API_KEY not set — email service running in degraded mode (emails will be skipped)');
            return;
        }
        if (!this.senderEmail || !this.senderName) {
            console.warn('BREVO_SENDER_EMAIL / BREVO_SENDER_NAME not set — Brevo sends will fail until configured');
        }

        // Replaces the old transporter.verify(): a single /v3/account GET
        // confirms the API key works. Non-blocking and never throws — the
        // app must not crash when email is misconfigured.
        brevoFetch(BREVO_ACCOUNT_URL, { apiKey: this.apiKey, method: 'GET' })
            .then(({ ok, status }) => {
                if (ok) {
                    console.log('Email service initialized successfully (Brevo)');
                } else {
                    console.error(`Email service initialization failed: Brevo /v3/account returned status=${status}`);
                }
            })
            .catch((error) => {
                const isTimeout = error && error.name === 'AbortError';
                console.error(`Email service initialization failed: ${isTimeout ? 'timeout' : 'network error'}`);
            });
    }

    // Send OTP email
    async sendOTPEmail(email, otp, userName, userType) {
        return sendEmail(this, {
            subject: 'Password Reset - One Time Password',
            htmlContent: this.generateOTPEmailTemplate(otp, userName, userType),
            recipientEmail: email,
            recipientName: userName
        });
    }

    // Send reset link email
    async sendResetLinkEmail(email, resetToken, userName, userType, baseUrl) {
        const resetLink = `${baseUrl || config.baseUrl}/reset-password?token=${resetToken}&type=${userType}`;

        return sendEmail(this, {
            subject: 'Password Reset - Reset Link',
            htmlContent: this.generateResetLinkEmailTemplate(resetLink, userName, userType),
            recipientEmail: email,
            recipientName: userName
        });
    }

    // Send login OTP email
    async sendLoginOTP(email, otp, userName, userType) {
        return sendEmail(this, {
            subject: 'Login Verification - One Time Password',
            htmlContent: this.generateLoginOTPTemplate(otp, userName, userType),
            recipientEmail: email,
            recipientName: userName
        });
    }

    // SEV-H-014: send a student their one-time initial password.
    async sendStudentCredentials(email, userName, admissionNumber, tempPassword) {
        const htmlContent = `
                <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width:600px; margin:0 auto; color:#333;">
                    <h2>Welcome to EDTTI, ${userName}</h2>
                    <p>Your student portal account has been created.</p>
                    <p><strong>Admission Number:</strong> ${admissionNumber}</p>
                    <p><strong>Temporary Password:</strong>
                       <code style="font-size:16px; background:#f4f4f4; padding:4px 8px;">${tempPassword}</code></p>
                    <p style="color:#c0392b;"><strong>You must change this password the first time you log in.</strong>
                       This temporary password will not work for anything except setting your own password.</p>
                    <p>If you did not expect this email, contact the registrar's office.</p>
                </div>`;

        return sendEmail(this, {
            subject: 'Your Student Portal Account - Initial Password',
            htmlContent,
            recipientEmail: email,
            recipientName: userName
        });
    }

    // Tool request notification to trainers. Migrated verbatim from the
    // old nodemailer transporter in server.js; sends to many recipients.
    async sendToolRequestNotification(recipients, toolType, course, dueDate, instructions) {
        const htmlContent = `
                    <h2>New Tool Request</h2>
                    <p>Dear Trainer,</p>
                    <p>I trust this email finds you well. A new tool request has been submitted with the following details:</p>
                    <p><strong>Tool Type:</strong> ${toolType}</p>
                    <p><strong>Course:</strong> ${course}</p>
                    <p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>
                    ${instructions ? `<p><strong>Special Instructions:</strong> ${instructions}</p>` : ''}
                    <p>Please log in to the Staff Portal to view and process this request at your earliest convenience.</p>
                    <p>Best regards,</p>
                    <p><strong>Dr. James Kiprop</strong><br>
                    Deputy Principal (Academics)<br>
                    EMURUA DIKIRR TTI<br>
                    <em>Excellence in Technical Education</em></p>
                `;

        return sendEmail(this, {
            subject: `New Tool Request: ${toolType}`,
            htmlContent,
            recipients
        });
    }

    // Generate OTP email template
    generateOTPEmailTemplate(otp, userName, userType) {
        const userTypeDisplay = userType.charAt(0).toUpperCase() + userType.slice(1);

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset OTP</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #7A0C0C, #8B2A2A);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 40px 30px;
                }
                .otp-box {
                    background: #f8f9fa;
                    border: 2px dashed #7A0C0C;
                    border-radius: 10px;
                    padding: 20px;
                    text-align: center;
                    margin: 20px 0;
                }
                .otp-code {
                    font-size: 32px;
                    font-weight: bold;
                    color: #7A0C0C;
                    letter-spacing: 8px;
                    font-family: 'Courier New', monospace;
                }
                .warning {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .footer {
                    background: #f8f9fa;
                    padding: 20px 30px;
                    text-align: center;
                    font-size: 14px;
                    color: #666;
                }
                .security-notice {
                    background: #e7f3ff;
                    border-left: 4px solid #2196F3;
                    padding: 15px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Password Reset Request</h1>
                    <p>EDTTI University Management System</p>
                </div>

                <div class="content">
                    <h2>Hello ${userName},</h2>
                    <p>We received a request to reset your password for your ${userTypeDisplay} account. Please use the One Time Password (OTP) below to proceed with your password reset.</p>

                    <div class="otp-box">
                        <p style="margin: 0; font-size: 16px; color: #666;">Your OTP Code:</p>
                        <div class="otp-code">${otp}</div>
                    </div>

                    <div class="warning">
                        <strong>⚠️ Important Security Information:</strong>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>This OTP is valid for <strong>10 minutes only</strong></li>
                            <li>You have <strong>5 attempts</strong> to enter the correct OTP</li>
                            <li>Do not share this code with anyone</li>
                            <li>Our support team will never ask for your OTP</li>
                        </ul>
                    </div>

                    <div class="security-notice">
                        <strong>🛡️ Security Notice:</strong>
                        <p style="margin: 5px 0;">If you did not request this password reset, please ignore this email and ensure your account is secure. Your current password will remain unchanged.</p>
                    </div>

                    <p>To reset your password, return to the login page and enter this OTP when prompted.</p>

                    <p>Best regards,<br>
                    <strong>EDTTI IT Support Team</strong></p>
                </div>

                <div class="footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                    <p>&copy; ${new Date().getFullYear()} EDTTI University Management System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Generate reset link email template
    generateResetLinkEmailTemplate(resetLink, userName, userType) {
        const userTypeDisplay = userType.charAt(0).toUpperCase() + userType.slice(1);

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Link</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #7A0C0C, #8B2A2A);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 40px 30px;
                }
                .reset-button {
                    display: inline-block;
                    background: linear-gradient(135deg, #7A0C0C, #8B2A2A);
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    text-align: center;
                    margin: 20px 0;
                    font-size: 16px;
                    transition: background 0.3s ease;
                }
                .reset-button:hover {
                    background: linear-gradient(135deg, #8B2A2A, #9B3A3A);
                }
                .warning {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .footer {
                    background: #f8f9fa;
                    padding: 20px 30px;
                    text-align: center;
                    font-size: 14px;
                    color: #666;
                }
                .security-notice {
                    background: #e7f3ff;
                    border-left: 4px solid #2196F3;
                    padding: 15px;
                    margin: 20px 0;
                }
                .link-fallback {
                    background: #f8f9fa;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                    word-break: break-all;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Password Reset Link</h1>
                    <p>EDTTI University Management System</p>
                </div>

                <div class="content">
                    <h2>Hello ${userName},</h2>
                    <p>We received a request to reset your password for your ${userTypeDisplay} account. Click the button below to create a new password.</p>

                    <div style="text-align: center;">
                        <a href="${resetLink}" class="reset-button">🔑 Reset My Password</a>
                    </div>

                    <div class="warning">
                        <strong>⚠️ Important Security Information:</strong>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>This link is valid for <strong>1 hour only</strong></li>
                            <li>The link can only be used <strong>once</strong></li>
                            <li>Do not share this link with anyone</li>
                            <li>Our support team will never ask for your reset link</li>
                        </ul>
                    </div>

                    <div class="security-notice">
                        <strong>🛡️ Security Notice:</strong>
                        <p style="margin: 5px 0;">If you did not request this password reset, please ignore this email and ensure your account is secure. Your current password will remain unchanged.</p>
                    </div>

                    <p><strong>Can't click the button?</strong> Copy and paste this link into your browser:</p>
                    <div class="link-fallback">
                        ${resetLink}
                    </div>

                    <p>Best regards,<br>
                    <strong>EDTTI IT Support Team</strong></p>
                </div>

                <div class="footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                    <p>&copy; ${new Date().getFullYear()} EDTTI University Management System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Generate login OTP email template
    generateLoginOTPTemplate(otp, userName, userType) {
        const roleNames = {
            'admin': 'Administrator',
            'deputy': 'Deputy Principal',
            'finance': 'Finance Officer',
            'dean': 'Dean of Students',
            'ilo': 'Industry Liaison Officer',
            'registrar': 'Registrar',
            'hod': 'Head of Department',
            'trainer': 'Trainer',
            'student': 'Student'
        };

        const userTypeDisplay = roleNames[userType] || userType.charAt(0).toUpperCase() + userType.slice(1);

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login Verification OTP</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #2196F3, #1976D2);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 40px 30px;
                }
                .otp-box {
                    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                    border: 3px solid #2196F3;
                    border-radius: 15px;
                    padding: 30px;
                    text-align: center;
                    margin: 25px 0;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                }
                .otp-code {
                    font-size: 40px;
                    font-weight: bold;
                    color: #1976D2;
                    letter-spacing: 10px;
                    font-family: 'Courier New', monospace;
                    margin: 15px 0;
                }
                .info-box {
                    background: #e3f2fd;
                    border-left: 4px solid #2196F3;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 5px;
                }
                .warning {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .footer {
                    background: #f8f9fa;
                    padding: 20px 30px;
                    text-align: center;
                    font-size: 14px;
                    color: #666;
                }
                .security-badge {
                    display: inline-block;
                    background: #4CAF50;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: bold;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Login Verification</h1>
                    <p>EDTTI University Management System</p>
                    <div class="security-badge">🛡️ SECURE LOGIN</div>
                </div>

                <div class="content">
                    <h2>Hello ${userName},</h2>
                    <p>You are attempting to sign in to your <strong>${userTypeDisplay}</strong> account. Please use the One Time Password (OTP) below to complete your login.</p>

                    <div class="otp-box">
                        <p style="margin: 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px;">Your Verification Code</p>
                        <div class="otp-code">${otp}</div>
                        <p style="margin: 0; font-size: 12px; color: #999;">Enter this code to proceed</p>
                    </div>

                    <div class="info-box">
                        <strong>📋 Login Details:</strong>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li><strong>Account Type:</strong> ${userTypeDisplay}</li>
                            <li><strong>Email:</strong> ${userName.includes('@') ? userName.split('@')[0] + '@***' : userName}</li>
                            <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
                        </ul>
                    </div>

                    <div class="warning">
                        <strong>⚠️ Important Security Information:</strong>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>This OTP is valid for <strong>10 minutes only</strong></li>
                            <li>You have <strong>5 attempts</strong> to enter the correct OTP</li>
                            <li>Never share this code with anyone</li>
                            <li>EDTTI staff will never ask for your OTP</li>
                        </ul>
                    </div>

                    <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 5px;">
                        <strong>🚨 Didn't Request This?</strong>
                        <p style="margin: 5px 0;">If you did not attempt to log in, please ignore this email and contact IT Support immediately. Your password remains secure.</p>
                    </div>

                    <p>For security reasons, this verification code will expire after 10 minutes.</p>

                    <p>Best regards,<br>
                    <strong>EDTTI IT Security Team</strong></p>
                </div>

                <div class="footer">
                    <p>This is an automated security message. Please do not reply to this email.</p>
                    <p>If you need assistance, contact IT Support: support@edtti.ac.ke</p>
                    <p>&copy; ${new Date().getFullYear()} EDTTI University Management System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Test email connection
    async testConnection() {
        if (!this.apiKey) {
            return { success: false, error: 'BREVO_API_KEY not set' };
        }
        try {
            const { ok, status } = await brevoFetch(BREVO_ACCOUNT_URL, { apiKey: this.apiKey, method: 'GET' });
            if (ok) {
                return { success: true, message: 'Email service is working' };
            }
            return { success: false, error: `Brevo /v3/account returned status=${status}` };
        } catch (error) {
            const isTimeout = error && error.name === 'AbortError';
            return { success: false, error: isTimeout ? 'request timeout' : 'network error' };
        }
    }
}

// Export the class and singleton instance
module.exports = EmailService;
