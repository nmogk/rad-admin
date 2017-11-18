var bookshelf = require('../config/bookshelf');
//var Reset = require('../models/invitations');

var model = bookshelf.Model.extend({
    tableName: 'users',
    hasSecurePassword: true//,
    // reset: function() {
    //     return this.hasOne(Reset)
    // }
});

module.exports = model;