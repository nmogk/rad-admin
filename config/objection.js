var { Model } = require('objection');
var knex = require('./database');

Model.knex(knex);

module.exports = Model;
