var bookshelf = require('../config/bookshelf');
var passwordToken = require('./invitations');

var model = bookshelf.Model.extend({
    tableName: 'users',
    hasSecurePassword: true,
    resetToken: function(){
        return this.hasOne(passwordToken);
    }
});

module.exports = model;