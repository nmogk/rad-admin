var knex = require('knex')({
    client : 'mysql',
    connection : {
        host     : 'localhost',
        user     : 'rad_user',
        password : 'g9LCDifwYZOWH8Irqboo7if3wykmHF', // This is for the test system only. Localized upon installation.
        database : 'rad_admin',
        charset  : 'utf8'
}});

module.exports = knex;
