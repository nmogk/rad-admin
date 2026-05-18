var express = require('express');
var fs = require('fs');
var path = require('path');
var router = express.Router();
var SiteContent = require('../models/site-content');
var log4js = require('log4js');
var auditLogger = log4js.getLogger('audit');

var ALLOWED_KEYS = ['backstory', 'search_help', 'rest_help', 'search_area'];

// Source file for each section, used by POST /:key/reset to reload the
// canonical on-disk markup back into the DB. Mirrors tools/seedSiteContent.js.
var FILE_BY_KEY = {
    'backstory':   path.join(__dirname, '..', 'views', 'partials', 'backstoryContents.hbs'),
    'search_help': path.join(__dirname, '..', 'views', 'partials', 'searchHelp.hbs'),
    'rest_help':   path.join(__dirname, '..', 'views', 'partials', 'restHelp.hbs'),
    'search_area': path.join(__dirname, '..', 'views', 'partials', 'searchArea.hbs')
};

router.get('/', async function (req, res, next) {
    try {
        var sections = await SiteContent.query();
        var sectionsData = {};
        sections.forEach(function (section) {
            sectionsData[section.section_key] = {
                section_key: section.section_key,
                title: section.title,
                content: section.content,
                updated_at: section.updated_at,
                updated_by: section.updated_by
            };
        });
        req.replacements.sections = sectionsData;
        req.replacements.sectionsJson = JSON.stringify(sectionsData);
        req.replacements.sitActive = 1;
        req.replacements.editable = req.user.permission >= 1;
        res.render('site', req.replacements);
    } catch (err) {
        next(err);
    }
});

router.post('/:key', async function (req, res, next) {
    if (req.user.permission < 1) {
        req.flash('error', 'You do not have permission to edit site content.');
        res.status(403).json({ redirect: '/site' });
        return;
    }

    var key = req.params.key;
    if (ALLOWED_KEYS.indexOf(key) === -1) {
        req.flash('error', 'Invalid content section.');
        res.status(400).json({ redirect: '/site' });
        return;
    }

    try {
        var existing = await SiteContent.query().findOne({ section_key: key });
        if (existing) {
            await existing.$query().patch({
                title: req.body.title || null,
                content: req.body.content,
                updated_at: new Date(),
                updated_by: req.user.email
            });
        } else {
            await SiteContent.query().insert({
                section_key: key,
                title: req.body.title || null,
                content: req.body.content,
                updated_at: new Date(),
                updated_by: req.user.email
            });
        }
        SiteContent.invalidateCache();
        auditLogger.info(req.user.email + ' edited site content: ' + key);
        req.flash('yay', 'Site content updated successfully.');
        res.json({ redirect: '/site' });
    } catch (err) {
        console.log(err);
        req.flash('error', 'Problem saving site content.');
        res.json({ redirect: '/site' });
    }
});

router.post('/:key/reset', async function (req, res, next) {
    if (req.user.permission < 1) {
        res.status(403).json({ error: 'You do not have permission to edit site content.' });
        return;
    }

    var key = req.params.key;
    if (ALLOWED_KEYS.indexOf(key) === -1) {
        res.status(400).json({ error: 'Invalid content section.' });
        return;
    }

    var content;
    try {
        content = fs.readFileSync(FILE_BY_KEY[key], 'utf8');
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to read source file.' });
        return;
    }

    var now = new Date();
    var email = req.user.email;

    try {
        var existing = await SiteContent.query().findOne({ section_key: key });
        if (existing) {
            await existing.$query().patch({
                content: content,
                updated_at: now,
                updated_by: email
            });
        } else {
            await SiteContent.query().insert({
                section_key: key,
                title: null,
                content: content,
                updated_at: now,
                updated_by: email
            });
        }
        SiteContent.invalidateCache();
        auditLogger.info(email + ' reset site content from file: ' + key);
        res.json({ content: content, updated_at: now, updated_by: email });
    } catch (err) {
        // Surface the underlying DB error so the client alert includes
        // something diagnostic instead of just "Problem saving".
        console.log(err);
        res.status(500).json({ error: 'Problem saving site content: ' + (err && err.message ? err.message : err) });
    }
});

module.exports = router;
