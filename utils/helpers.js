const bcrypt = require('bcryptjs');
const cryptoJS = require('crypto-js');
const moment = require('moment');
const qr = require('qr-image');

const helpers = {
    generateOrderCode() {
        const prefix = 'QAT';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    },
    
    generateTransactionId() {
        return `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    },
    
    async hashPassword(password) {
        return bcrypt.hash(password, 12);
    },
    
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('ar-YE', {
            style: 'currency',
            currency: 'YER',
            minimumFractionDigits: 0
        }).format(amount);
    },
    
    formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
        return moment(date).format(format);
    },
    
    encrypt(text) {
        return cryptoJS.AES.encrypt(text, process.env.ENCRYPTION_KEY || 'qat-pro-secure-key').toString();
    },
    
    decrypt(ciphertext) {
        const bytes = cryptoJS.AES.decrypt(ciphertext, process.env.ENCRYPTION_KEY || 'qat-pro-secure-key');
        return bytes.toString(cryptoJS.enc.Utf8);
    }
};

module.exports = helpers;
