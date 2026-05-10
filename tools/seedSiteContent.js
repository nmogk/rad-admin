/**
 * One-time seed script to populate the site_content table with existing partial content.
 *
 * Usage: node tools/seedSiteContent.js
 *
 * Requires: .env configured with database credentials, site_content table created.
 */
require('dotenv').config();
var fs = require('fs');
var path = require('path');
var knex = require('../config/database');

var sections = [
    {
        section_key: 'backstory',
        title: 'The Behind-the-Scenes Story',
        file: path.join(__dirname, '..', 'views', 'partials', 'backstoryContents.hbs')
    },
    {
        section_key: 'search_area',
        title: 'Search Area Intro',
        file: path.join(__dirname, '..', 'views', 'partials', 'searchArea.hbs')
    },
    {
        section_key: 'search_help',
        title: 'Search Help',
        file: path.join(__dirname, '..', 'views', 'partials', 'searchHelp.hbs')
    },
    {
        section_key: 'rest_help',
        title: 'REST API',
        file: path.join(__dirname, '..', 'views', 'partials', 'restHelp.hbs')
    }
];

var now = new Date();

Promise.all(sections.map(function (section) {
    var content = fs.readFileSync(section.file, 'utf8');
    return knex('site_content')
        .insert({
            section_key: section.section_key,
            title: section.title,
            content: content,
            updated_at: now,
            updated_by: 'seed'
        })
        .catch(function (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                console.log('Section "' + section.section_key + '" already exists, skipping.');
                return;
            }
            throw err;
        });
}))
.then(function () {
    console.log('Site content seeded successfully.');
    process.exit(0);
})
.catch(function (err) {
    console.error('Error seeding site content:', err);
    process.exit(1);
});
