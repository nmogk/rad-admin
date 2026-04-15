var bookshelf = require('../config/bookshelf');

var model = bookshelf.Model.extend({
    tableName: 'site_content'
});

module.exports = model;
