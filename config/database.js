var knex = require('knex')({
    client : 'mysql',
    connection : {
        host     : 'localhost',
        user     : process.env.DBUSER,
        password : process.env.DBUSERPASS,
        database : 'rad_admin',
        charset  : 'utf8'
}});

module.exports = knex;
