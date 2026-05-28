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
                'accept': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
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

    const to = Array.isArray(recipients) && recipients.length
        ? recipients.map((email) => ({ email }))
        : [{ email: recipientEmail, name: recipientName || recipientEmail }];

    const payload = {
        sender: { name: service.senderName, email: service.senderEmail },
        to,
        subject,
        htmlContent,
    };
    if (textContent) payload.textContent = textContent;

    try {
        const { ok, status, json } = await brevoFetch(BREVO_SEND_URL, {
            apiKey: service.apiKey,
            method: 'POST',
            body: payload,
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

// ---------------------------------------------------------------------------
// Template helpers
//
// Every email shares the same shell:
//   - Light grey body background, white card, 600px max width
//   - EDTTI maroon header bar with the institution name
//   - Greeting line addressing the recipient by name
//   - Body block (caller-supplied)
//   - Footer with institution name + do-not-reply notice
//
// Inline CSS only — most email clients strip <style> blocks. No external
// images or fonts (they are blocked by default in Outlook / Gmail clipping).
// ---------------------------------------------------------------------------

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const HEADER_BG = '#7A0C0C';
const ACCENT = '#D4A017';

function emailLayout({ preheader = '', heading, recipientName, bodyHtml, footerNote = '' }) {
    const year = new Date().getFullYear();
    const safeName = escapeHtml(recipientName || 'Student');
    const safeHeading = escapeHtml(heading || 'EDTTI Notification');

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeHeading}</title>
</head>
<body style="margin:0; padding:0; background:#f4f4f6; font-family:'Segoe UI', Tahoma, Helvetica, Arial, sans-serif; color:#1f2937; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all; font-size:1px; line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:${HEADER_BG}; padding:24px 32px;" align="left">
            <div style="font-size:11px; letter-spacing:0.18em; color:#fde8c8; text-transform:uppercase; font-weight:600;">EDTTI</div>
            <div style="font-size:20px; color:#ffffff; font-weight:700; margin-top:4px;">Emurua Dikirr Technical Training Institute</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px 32px; font-size:16px; color:#111827;">
            <p style="margin:0 0 8px 0; font-size:16px; color:#111827; font-weight:600;">Hello ${safeName},</p>
            <h1 style="margin:8px 0 16px 0; font-size:22px; line-height:1.3; color:#111827; font-weight:700;">${safeHeading}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px 32px; font-size:15px; line-height:1.6; color:#1f2937;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #e5e7eb; padding:20px 32px; background:#f9fafb; font-size:12px; color:#6b7280; text-align:center;">
            ${footerNote ? `<div style="margin-bottom:8px; color:#374151;">${footerNote}</div>` : ''}
            <div style="margin-bottom:4px;"><strong style="color:#374151;">Emurua Dikirr Technical Training Institute (EDTTI)</strong></div>
            <div>This is an automated message from the EDTTI University Management System. <strong>Please do not reply</strong> &mdash; this inbox is not monitored.</div>
            <div style="margin-top:6px;">&copy; ${year} EDTTI. All rights reserved.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function calloutBox(label, value, color = ACCENT) {
    return `<div style="margin:16px 0; padding:16px; border:1px dashed ${color}; border-radius:6px; background:#fffaf0; text-align:center;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:#6b7280; margin-bottom:6px;">${escapeHtml(label)}</div>
        <div style="font-family:'Courier New', monospace; font-size:26px; font-weight:700; letter-spacing:6px; color:${color};">${escapeHtml(value)}</div>
    </div>`;
}

function infoList(items) {
    return `<ul style="margin:12px 0 16px 20px; padding:0; color:#374151;">${items.map(i => `<li style="margin:4px 0;">${i}</li>`).join('')}</ul>`;
}

function primaryButton(label, href) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
        <tr>
            <td align="center" style="border-radius:6px; background:${HEADER_BG};">
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:6px;">${escapeHtml(label)}</a>
            </td>
        </tr>
    </table>`;
}

function roleLabel(role) {
    const map = {
        admin: 'Administrator',
        registrar: 'Registrar',
        finance: 'Finance Officer',
        dean: 'Dean of Students',
        deputy: 'Deputy Principal',
        ilo: 'Industry Liaison Officer',
        cibec: 'CIBEC Officer',
        hod: 'Head of Department',
        trainer: 'Trainer',
        student: 'Student',
    };
    if (!role) return 'User';
    return map[String(role).toLowerCase()] || (role.charAt(0).toUpperCase() + role.slice(1));
}

class EmailService {
    constructor() {
        this.apiKey = process.env.BREVO_API_KEY || null;
        this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@edtti.ac.ke';
        this.senderName = process.env.BREVO_SENDER_NAME || 'EDTTI University Management System';
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

    // ------------------------------------------------------------------
    // Password-reset OTP (sent to anyone using "forgot password" → OTP).
    // ------------------------------------------------------------------
    async sendOTPEmail(email, otp, userName, userType) {
        const body = `
            <p style="margin:0 0 12px 0;">We received a request to reset your <strong>${escapeHtml(roleLabel(userType))}</strong> password. Use the One-Time Password (OTP) below to continue.</p>
            ${calloutBox('Your OTP Code', otp)}
            <p style="margin:0 0 8px 0; font-weight:600; color:#374151;">Important</p>
            ${infoList([
                'This OTP is valid for <strong>10 minutes</strong> only.',
                'You have <strong>5 attempts</strong> to enter the correct code.',
                'Never share this code with anyone &mdash; EDTTI staff will not ask for it.',
            ])}
            <p style="margin:16px 0 0 0; color:#374151;">If you did not request this reset, you can safely ignore this email and your password will remain unchanged.</p>
        `;
        return sendEmail(this, {
            subject: 'EDTTI Password Reset — One-Time Password',
            htmlContent: emailLayout({
                preheader: 'Use this OTP to reset your EDTTI password',
                heading: 'Password Reset Request',
                recipientName: userName,
                bodyHtml: body,
            }),
            recipientEmail: email,
            recipientName: userName,
        });
    }

    // ------------------------------------------------------------------
    // Password-reset link (sent to anyone using "forgot password" → link).
    // ------------------------------------------------------------------
    async sendResetLinkEmail(email, resetToken, userName, userType, baseUrl) {
        const resetLink = `${baseUrl || config.baseUrl}/reset-password?token=${resetToken}&type=${userType}`;
        const body = `
            <p style="margin:0 0 12px 0;">We received a request to reset your <strong>${escapeHtml(roleLabel(userType))}</strong> password. Use the secure button below to create a new password.</p>
            ${primaryButton('Reset My Password', resetLink)}
            <p style="margin:0 0 8px 0; font-weight:600; color:#374151;">Important</p>
            ${infoList([
                'This link is valid for <strong>1 hour</strong>.',
                'The link can be used <strong>once</strong>; after that you will need to request a new one.',
                'Never share this link with anyone.',
            ])}
            <p style="margin:16px 0 8px 0; color:#374151;">If the button does not work, copy and paste the URL below into your browser:</p>
            <div style="word-break:break-all; padding:12px; border:1px solid #e5e7eb; border-radius:6px; background:#f9fafb; font-family:'Courier New', monospace; font-size:12px; color:#374151;">${escapeHtml(resetLink)}</div>
            <p style="margin:16px 0 0 0; color:#374151;">If you did not request this reset, you can safely ignore this email and your password will remain unchanged.</p>
        `;
        return sendEmail(this, {
            subject: 'EDTTI Password Reset — Reset Link',
            htmlContent: emailLayout({
                preheader: 'Click the link to reset your EDTTI password',
                heading: 'Password Reset Link',
                recipientName: userName,
                bodyHtml: body,
            }),
            recipientEmail: email,
            recipientName: userName,
        });
    }

    // ------------------------------------------------------------------
    // Login verification OTP (sent during MFA login).
    // ------------------------------------------------------------------
    async sendLoginOTP(email, otp, userName, userType) {
        const sentAt = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
        const body = `
            <p style="margin:0 0 12px 0;">You are signing in to your <strong>${escapeHtml(roleLabel(userType))}</strong> account. Enter the one-time code below to complete your login.</p>
            ${calloutBox('Verification Code', otp)}
            <p style="margin:0 0 8px 0; font-weight:600; color:#374151;">Login Details</p>
            ${infoList([
                `Account Type: <strong>${escapeHtml(roleLabel(userType))}</strong>`,
                `Time: <strong>${escapeHtml(sentAt)}</strong>`,
                'Valid for <strong>10 minutes</strong>; up to <strong>5 attempts</strong> allowed.',
            ])}
            <p style="margin:16px 0 0 0; color:#b91c1c; font-weight:600;">Didn&rsquo;t try to sign in?</p>
            <p style="margin:6px 0 0 0; color:#374151;">If this wasn&rsquo;t you, ignore this email and contact IT Support. Your password remains secure.</p>
        `;
        return sendEmail(this, {
            subject: 'EDTTI Login Verification Code',
            htmlContent: emailLayout({
                preheader: 'Your EDTTI login verification code',
                heading: 'Login Verification',
                recipientName: userName,
                bodyHtml: body,
            }),
            recipientEmail: email,
            recipientName: userName,
        });
    }

    // ------------------------------------------------------------------
    // SEV-H-014: send a newly admitted student their one-time initial
    // password along with the admission number.
    // ------------------------------------------------------------------
    async sendStudentCredentials(email, userName, admissionNumber, tempPassword) {
        const body = `
            <p style="margin:0 0 12px 0;">Welcome to EDTTI! Your student portal account has been created. Use the credentials below to sign in and complete onboarding.</p>
            <div style="margin:16px 0; padding:16px 20px; border:1px solid #e5e7eb; border-radius:6px; background:#f9fafb;">
                <div style="margin-bottom:10px;">
                    <span style="display:inline-block; min-width:160px; color:#6b7280; font-size:13px;">Admission Number</span>
                    <span style="font-family:'Courier New', monospace; font-weight:600; color:#111827;">${escapeHtml(admissionNumber)}</span>
                </div>
                <div>
                    <span style="display:inline-block; min-width:160px; color:#6b7280; font-size:13px;">Temporary Password</span>
                    <span style="font-family:'Courier New', monospace; font-weight:600; color:#111827; background:#fff7ed; padding:4px 8px; border-radius:4px; border:1px solid #fed7aa;">${escapeHtml(tempPassword)}</span>
                </div>
            </div>
            <p style="margin:16px 0 8px 0; font-weight:600; color:#b91c1c;">You must change this password on first login.</p>
            ${infoList([
                'Sign in at the EDTTI student portal using your admission number and the temporary password above.',
                'You will be prompted to set a new password immediately. This temporary password only works for the password-change step.',
                'Keep your credentials private. Do not share them with anyone.',
            ])}
            <p style="margin:16px 0 0 0; color:#374151;">If you did not expect this email, please contact the Registrar&rsquo;s office.</p>
        `;
        return sendEmail(this, {
            subject: 'EDTTI Student Portal — Your Initial Password',
            htmlContent: emailLayout({
                preheader: 'Your EDTTI student portal credentials',
                heading: 'Welcome to EDTTI',
                recipientName: userName,
                bodyHtml: body,
            }),
            recipientEmail: email,
            recipientName: userName,
        });
    }

    // ------------------------------------------------------------------
    // Tool request notification to trainers / departments.
    // ------------------------------------------------------------------
    async sendToolRequestNotification(recipients, toolType, course, dueDate, instructions) {
        const dueLine = dueDate ? new Date(dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Not specified';
        const body = `
            <p style="margin:0 0 12px 0;">A new tools-of-trade request has been submitted on your behalf. Please log in to the Trainer Portal to review and respond.</p>
            <div style="margin:16px 0; padding:16px 20px; border:1px solid #e5e7eb; border-radius:6px; background:#f9fafb;">
                <div style="margin-bottom:8px;">
                    <span style="display:inline-block; min-width:120px; color:#6b7280; font-size:13px;">Tool Type</span>
                    <span style="font-weight:600; color:#111827;">${escapeHtml(toolType || 'N/A')}</span>
                </div>
                <div style="margin-bottom:8px;">
                    <span style="display:inline-block; min-width:120px; color:#6b7280; font-size:13px;">Course</span>
                    <span style="font-weight:600; color:#111827;">${escapeHtml(course || 'N/A')}</span>
                </div>
                <div>
                    <span style="display:inline-block; min-width:120px; color:#6b7280; font-size:13px;">Due Date</span>
                    <span style="font-weight:600; color:#111827;">${escapeHtml(dueLine)}</span>
                </div>
            </div>
            ${instructions ? `<p style="margin:16px 0 6px 0; font-weight:600; color:#374151;">Special Instructions</p><div style="padding:12px; border-left:3px solid ${ACCENT}; background:#fffaf0; color:#374151;">${escapeHtml(instructions)}</div>` : ''}
            <p style="margin:18px 0 0 0; color:#374151;">Please process this request at your earliest convenience.</p>
        `;
        return sendEmail(this, {
            subject: `EDTTI Tool Request: ${toolType}`,
            htmlContent: emailLayout({
                preheader: 'New tools-of-trade request pending your action',
                heading: 'New Tool Request',
                recipientName: 'Trainer',
                bodyHtml: body,
                footerNote: 'Tools-of-Trade notifications are sent by the Deputy Principal (Academics) office.',
            }),
            recipients,
        });
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

module.exports = EmailService;
// Helpers exported for tests / future tooling.
module.exports.emailLayout = emailLayout;
module.exports.escapeHtml = escapeHtml;
