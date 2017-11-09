
module.exports = function(mysql) {
    return mysql.createPool({
            host     : 'localhost',
            user     : 'rad_admin',
            password : 'g9LCDifwYZOWH8Irqboo7if3wykmHF',
            database : 'rad_admin'
        });
    };