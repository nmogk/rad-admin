var bookshelf = require('../config/bookshelf');

var model = bookshelf.Model.extend({
    tableName: 'users',
    hasSecurePassword: true,
});

module.exports = model;