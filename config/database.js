var knex = require('knex')({
    client : 'mysql',
    connection : {
        host     : 'localhost',
        user     : 'rad_user',
        password : 'g9LCDifwYZOWH8Irqboo7if3wykmHF',
        database : 'rad_admin',
        charset  : 'utf8'
}});

var bookshelf = require('bookshelf')(knex);
var securePassword = require('bookshelf-secure-password');

bookshelf.plugin(securePassword);

module.exports = bookshelf;
