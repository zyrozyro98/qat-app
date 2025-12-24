const winston = require('winston');
const path = require('path');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
    level: IS_PRODUCTION ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'qat-app-pro' },
    transports: [
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/error.log'), 
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger;
