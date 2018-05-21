var log4js = require('log4js');
log4js.configure({
    appenders: {
        audit: {
            type: 'file',
            filename: process.env.AUDIT_LOG_PATH + 'audit.log',
            maxLogSize: 1073741824 // 1GiB
        },
        app: {
            type: 'file',
            filename: 'logs/application.log',
            maxLogSize: 1073741824 // 1GiB
        }
    },
    categories: {
        default: {
            appenders: ['app'],
            level: 'debug'
        },
        audit: {
            appenders: ['audit'],
            level: 'info'
        }
    }
});

module.exports = log4js;