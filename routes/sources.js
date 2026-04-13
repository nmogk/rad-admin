var express = require('express');
var router = express.Router();
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var proxyOpts = require('../config/solr-proxy');
var solr = require('solr-client');
var client = solr.createClient(proxyOpts.backend.host, proxyOpts.backend.port, "source");
const url = require('url');

/* GET sources page. */
router.get('/', function (req, res, next) {
    res.render('sources', req.replacements);
});

/* Create a new source */
router.post('/new', function (req, res, next) {
    if (!req.body.name) {
        res.status(400).json({ error: 'Source name is required.' });
        return;
    }

    var doc = {};

    if (req.body.name) { doc.name = req.body.name; }
    if (req.body.address) { doc.address = req.body.address; }
    if (req.body.city) { doc.city = req.body.city; }
    if (req.body.state) { doc.state = req.body.state; }
    if (req.body.zip) { doc.zip = req.body.zip; }
    if (req.body.telephone) { doc.telephone = req.body.telephone; }
    if (req.body.fax) { doc.fax = req.body.fax; }
    if (req.body.email) { doc.email = req.body.email; }
    if (req.body.website) { doc.website = req.body.website; }

    client.add(doc, function (err, data) {
        if (err) {
            console.log(err);
            res.status(500).json({ error: 'A problem occurred during submit.' });
        } else {
            auditLogger.info(req.user.get("email") + " added a new source:\n" + JSON.stringify(doc));

            req.flash('yay', 'New source successfully added.');
            var encodedName = encodeURIComponent('"' + doc.name + '"');
            res.json({ redirect: '/sources?rows=1&q=name:' + encodedName });
        }
    });
});

/* Edit an existing source */
router.post("/:id", function (req, res, next) {
    var query = 'q=id:' + req.params.id;

    var doc = {};
    doc.id = req.params.id;

    if (req.body.name) { doc.name = req.body.name; }
    if (req.body.address) { doc.address = req.body.address; }
    if (req.body.city) { doc.city = req.body.city; }
    if (req.body.state) { doc.state = req.body.state; }
    if (req.body.zip) { doc.zip = req.body.zip; }
    if (req.body.telephone) { doc.telephone = req.body.telephone; }
    if (req.body.fax) { doc.fax = req.body.fax; }
    if (req.body.email) { doc.email = req.body.email; }
    if (req.body.website) { doc.website = req.body.website; }

    client.get('select', query, function (err, obj) {
        if (err) {
            console.log(err);
            res.status(500).json({ error: 'Unable to obtain a copy of source to edit for audit log. Source not edited.' });
        } else {
            var oldDoc = obj.response.docs[0];

            client.add(doc, function (err, data) {
                if (err) {
                    console.log(err);
                    res.status(500).json({ error: 'A problem occurred during edit submission.' });
                } else {
                    auditLogger.info(req.user.get("email") + " edited a source:\n" + JSON.stringify(oldDoc) + "\nA Original ||||| Updated V\n" + JSON.stringify(doc));

                    req.flash('yay', 'Source successfully edited.');
                    res.json({ redirect: url.format({ pathname: "/sources", query: req.query }) });
                }
            });
        }
    });
});

/* Delete a source */
router.delete("/:id", function (req, res, next) {
    if (req.user.get("permission") < 1) {
        res.redirect(403, "/sources");
        return;
    }

    var id = req.params.id;
    var query = 'q=id:' + id;

    client.get('select', query, function (err, obj) {
        if (err) {
            req.flash('error', 'Unable to obtain a copy of source to delete for audit log. Source not deleted.');
            res.json({ redirect: '/sources' });
        } else {
            var doc = obj.response.docs[0];

            client.deleteByID(id, function (err, data) {
                if (err) {
                    console.log(err);
                    req.flash('error', 'A problem occurred during delete submission.');
                    res.json({ redirect: '/sources' });
                } else {
                    auditLogger.info(req.user.get("email") + " deleted a source:\n" + JSON.stringify(doc));

                    req.flash('yay', 'Source successfully deleted.');
                    res.json({ redirect: url.format({ pathname: "/sources", query: req.query }) });
                }
            });
        }
    });
});

module.exports = router;
