/**
 * One-time migration: add the auto-managed `updated_at` column to the
 * `campaigns` table on a live deployment (#165). Fresh installs get the
 * column via migration.js, which runs the same raw SQL after createTables().
 *
 * The column is declared with DEFAULT CURRENT_TIMESTAMP ON UPDATE
 * CURRENT_TIMESTAMP so MySQL itself bumps the value on every UPDATE — no
 * application-side timestamp wrangling required, and the picker on /refs
 * sorts campaigns by this column to surface the most recently touched one.
 *
 * Usage: node tools/addCampaignUpdatedAt.js
 *
 * Safe to re-run — checks for the column first and exits cleanly if present.
 */
require('dotenv').config();
var knex = require('../config/database');

(async function () {
    try {
        var has = await knex.schema.hasColumn('campaigns', 'updated_at');
        if (has) {
            console.log('campaigns.updated_at already exists; nothing to do.');
            process.exit(0);
        }
        await knex.raw(
            'ALTER TABLE campaigns ADD COLUMN updated_at TIMESTAMP NOT NULL ' +
            'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        );
        console.log('Added auto-managed updated_at column to campaigns.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err && err.message);
        process.exit(1);
    }
})();
