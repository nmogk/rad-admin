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

router.get('/', function(req, res, next) {
    SiteContent.fetchAll()
    .then(function (sections) {
        var sectionsData = {};
        sections.models.forEach(function (section) {
            sectionsData[section.get('section_key')] = {
                section_key: section.get('section_key'),
                title: section.get('title'),
                content: section.get('content'),
                updated_at: section.get('updated_at'),
                updated_by: section.get('updated_by')
            };
        });
        req.replacements.sections = sectionsData;
        req.replacements.sectionsJson = JSON.stringify(sectionsData);
        req.replacements.sitActive = 1;
        req.replacements.editable = req.user.get('permission') >= 1;
        res.render('site', req.replacements);
    })
    .catch(function (err) {
        next(err);
    });
});

router.post('/:key', function(req, res, next) {
    if (req.user.get('permission') < 1) {
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

    new SiteContent({ section_key: key }).fetch()
    .then(function (existing) {
        if (existing) {
            existing.set('title', req.body.title || null);
            existing.set('content', req.body.content);
            existing.set('updated_at', new Date());
            existing.set('updated_by', req.user.get('email'));
            return existing.save();
        } else {
            return new SiteContent({
                section_key: key,
                title: req.body.title || null,
                content: req.body.content,
                updated_at: new Date(),
                updated_by: req.user.get('email')
            }).save(null, { method: 'insert' });
        }
    })
    .then(function () {
        auditLogger.info(req.user.get('email') + ' edited site content: ' + key);
        req.flash('yay', 'Site content updated successfully.');
        res.json({ redirect: '/site' });
    })
    .catch(function (err) {
        console.log(err);
        req.flash('error', 'Problem saving site content.');
        res.json({ redirect: '/site' });
    });
});

router.post('/:key/reset', function(req, res, next) {
    if (req.user.get('permission') < 1) {
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
    var email = req.user.get('email');

    new SiteContent({ section_key: key }).fetch()
    .then(function (existing) {
        if (existing) {
            existing.set('content', content);
            existing.set('updated_at', now);
            existing.set('updated_by', email);
            return existing.save();
        } else {
            return new SiteContent({
                section_key: key,
                content: content,
                updated_at: now,
                updated_by: email
            }).save(null, { method: 'insert' });
        }
    })
    .then(function () {
        auditLogger.info(email + ' reset site content from file: ' + key);
        res.json({ content: content, updated_at: now, updated_by: email });
    })
    .catch(function (err) {
        console.log(err);
        res.status(500).json({ error: 'Problem saving site content.' });
    });
});

module.exports = router;
