var bookshelf = require('../config/database');

var model = bookshelf.Model.extend({
    tableName: 'users',
    hasSecurePassword: true,
});

module.exports = model;