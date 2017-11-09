var knex = require('knex')({
    client : 'mysql',
    connection : {
        host     : 'localhost',
        user     : 'rad_user',
        password : 'g9LCDifwYZOWH8Irqboo7if3wykmHF',
        database : 'rad_admin',
        charset  : 'utf8'
}});

module.exports = require('bookshelf')(knex);
