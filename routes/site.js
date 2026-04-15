var express = require('express');
var router = express.Router();
var SiteContent = require('../models/site-content');
var log4js = require('log4js');
var auditLogger = log4js.getLogger('audit');

var ALLOWED_KEYS = ['backstory', 'search_help', 'rest_help'];

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

module.exports = router;
