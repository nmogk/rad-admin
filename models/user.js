var bookshelf = require('../config/database');

var model = bookshelf.Model.extend({
    tablename: 'users',
    hasSecurePassword: true,
});

module.exports = model;