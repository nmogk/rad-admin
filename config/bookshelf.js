var knex = require('./database');
var bookshelf = require('bookshelf')(knex);
var securePassword = require('bookshelf-secure-password');

bookshelf.plugin(securePassword);

module.exports = bookshelf;