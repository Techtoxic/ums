const nodemailer = require('nodemailer');
const config = require('../config/config');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 587,
                secure: false, // Use TLS
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_APP_PASSWORD // App password
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            // Verify connection
            this.transporter.verify((error, success) => {
                if (error) {
                    console.error('❌ Email service initialization failed:', error);
                } else {
                    console.log('✅ Email service initialized successfully');
                }
            });
        } catch (error) {
            console.error('❌ Failed to create email transporter:', error);
        }
    }

    // Send OTP email
    async sendOTPEmail(email, otp, userName, userType) {
        try {
            const mailOptions = {
                from: {
                    name: 'EDTTI University Management System',
                    address: process.env.EMAIL_USER
                },
                to: email,
                subject: 'Password Reset - One Time Password',
                html: this.generateOTPEmailTemplate(otp, userName, userType)
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('✅ OTP email sent successfully:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ Failed to send OTP email:', error);
            return { success: false, error: error.message };
        }
    }

    // Send reset link email
    async sendResetLinkEmail(email, resetToken, userName, userType) {
        try {
            const resetLink = `${config.baseUrl}/reset-password?token=${resetToken}&type=${userType}`;
            
            const mailOptions = {
                from: {
                    name: 'EDTTI University Management System',
                    address: process.env.EMAIL_USER
                },
                to: email,
                subject: 'Password Reset - Reset Link',
                html: this.generateResetLinkEmailTemplate(resetLink, userName, userType)
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('✅ Reset link email sent successfully:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ Failed to send reset link email:', error);
            return { success: false, error: error.message };
        }
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

    // Test email connection
    async testConnection() {
        try {
            await this.transporter.verify();
            return { success: true, message: 'Email service is working' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Export the class and singleton instance
module.exports = EmailService;
