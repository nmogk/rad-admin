require('dotenv').config();
var knex = require('./config/database');
var Schema = require('./models/schema');
var _ = require('lodash');
var User = require('./models/user');

function createTable(tableName) {
  return knex.schema.createTable(tableName, function (table) {
    var column;
    var columnKeys = _.keys(Schema[tableName]);
    _.each(columnKeys, function (key) {
      if (Schema[tableName][key].type === 'text' && Schema[tableName][key].hasOwnProperty('fieldtype')) {
        column = table[Schema[tableName][key].type](key, Schema[tableName][key].fieldtype);
      }
      else if (Schema[tableName][key].type === 'string' && Schema[tableName][key].hasOwnProperty('maxlength')) {
        column = table[Schema[tableName][key].type](key, Schema[tableName][key].maxlength);
      }
      else {
        column = table[Schema[tableName][key].type](key);
      }
      if (Schema[tableName][key].hasOwnProperty('nullable') && Schema[tableName][key].nullable === true) {
        column.nullable();
      }
      else {
        column.notNullable();
      }
      if (Schema[tableName][key].hasOwnProperty('primary') && Schema[tableName][key].primary === true) {
        column.primary();
      }
      if (Schema[tableName][key].hasOwnProperty('unique') && Schema[tableName][key].unique) {
        column.unique();
      }
      if (Schema[tableName][key].hasOwnProperty('unsigned') && Schema[tableName][key].unsigned) {
        column.unsigned();
      }
      if (Schema[tableName][key].hasOwnProperty('references')) {
        column.references(Schema[tableName][key].references);
      }
      if (Schema[tableName][key].hasOwnProperty('defaultTo')) {
        column.defaultTo(Schema[tableName][key].defaultTo);
      }
    });
  });
}

async function createTables() {
  for (var tableName of _.keys(Schema)) {
    await createTable(tableName);
  }
}

// Auto-managed picker recency timestamp for campaigns (#165). Lives outside
// the generic Schema loop above because the loop has no way to express
// MySQL's ON UPDATE CURRENT_TIMESTAMP. Live deployments run the same SQL via
// tools/addCampaignUpdatedAt.js.
var CAMPAIGN_UPDATED_AT_DDL =
  'ALTER TABLE campaigns ADD COLUMN updated_at TIMESTAMP NOT NULL ' +
  'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';

createTables()
  .then(function () {
    return knex.raw(CAMPAIGN_UPDATED_AT_DDL);
  })
  .then(function () {
    return User.query().insert({
      email: process.env.BOOTSTRAP_ADMIN,
      password: process.env.BOOTSTRAP_PASS,
      permission: 2,
      validated: 1
    });
  })
  .then(function () {
    console.log('Tables created!!');
    process.exit(0);
  })
  .catch(function (error) {
    throw error;
  });
