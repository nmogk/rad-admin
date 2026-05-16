require('dotenv').config();
var knex = require('./config/database');

async function ensureTypeColumn() {
    var hasTable = await knex.schema.hasTable('periodicals');
    if (!hasTable) {
        console.error('periodicals table does not exist. Run `node migration-add-tasks.js` first.');
        process.exit(1);
    }
    var hasCol = await knex.schema.hasColumn('periodicals', 'type');
    if (hasCol) {
        console.log('skip type column (already exists)');
        return;
    }
    await knex.schema.alterTable('periodicals', function (table) {
        table.string('type', 50).nullable();
    });
    console.log('added periodicals.type');
}

ensureTypeColumn()
    .then(function () {
        console.log('Done.');
        process.exit(0);
    })
    .catch(function (error) {
        console.error(error);
        process.exit(1);
    });
