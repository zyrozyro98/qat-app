const nodemailer = require('nodemailer');
const logger = require('./logger');

const emailService = {
    transporter: null,
    
    initialize() {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            
            logger.info('📧 تم تهيئة خدمة البريد الإلكتروني');
        } else {
            logger.warn('⚠️ إعدادات SMTP غير متوفرة، سيتم تعطيل إرسال البريد الإلكتروني');
        }
    },
    
    async sendEmail(to, subject, html, attachments = []) {
        if (!this.transporter) {
            logger.warn('📧 خدمة البريد الإلكتروني غير مهيئة');
            return null;
        }
        
        try {
            const mailOptions = {
                from: `"تطبيق قات PRO" <${process.env.SMTP_USER || 'noreply@qat-app.com'}>`,
                to,
                subject,
                html,
                attachments
            };
            
            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`📧 بريد إلكتروني مرسل إلى ${to}: ${info.messageId}`);
            return info;
        } catch (error) {
            logger.error(`❌ خطأ في إرسال البريد الإلكتروني: ${error.message}`);
            throw error;
        }
    }
};

module.exports = emailService;
