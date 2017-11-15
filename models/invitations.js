var bookshelf = require('../config/bookshelf');
var user = require('./user');

var model = bookshelf.Model.extend({
    tableName: 'invitations',
    user: function(){
        return this.belongsTo(user);
    }
});

module.exports = model;