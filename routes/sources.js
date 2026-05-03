var express = require('express');
var router = express.Router();
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var proxyOpts = require('../config/solr-proxy');
var solr = require('../config/solr-client');
var fieldDescriptions = require('../config/fieldDescriptions');
var client = solr.createClient({ host: proxyOpts.backend.host, port: proxyOpts.backend.port, core: "source" });
const url = require('url');
const { randomUUID } = require('crypto');

function buildDoc(body) {
    var doc = {};
    if (body.name) { doc.name = body.name; }
    if (body.address) { doc.address = body.address; }
    if (body.city) { doc.city = body.city; }
    if (body.state) { doc.state = body.state; }
    if (body.zip) { doc.zip = body.zip; }
    if (body.telephone) { doc.telephone = body.telephone; }
    if (body.fax) { doc.fax = body.fax; }
    if (body.email) { doc.email = body.email; }
    if (body.website) { doc.website = body.website; }
    return doc;
}

/* GET sources page. */
router.get('/', function (req, res, next) {
    res.render('sources', Object.assign({}, req.replacements, { fieldDocs: fieldDescriptions.sources }));
});

/* Create a new source */
router.post('/new', async function (req, res, next) {
    if (!req.body.name) {
        res.status(400).json({ error: 'Source name is required.' });
        return;
    }

    var doc = buildDoc(req.body);
    doc.id = randomUUID();

    try {
        await client.add(doc);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred during submit.' });
        return;
    }

    auditLogger.info(req.user.get("email") + " added a new source:\n" + JSON.stringify(doc));
    req.flash('yay', 'New source successfully added.');
    var encodedName = encodeURIComponent('"' + doc.name + '"');
    res.json({ redirect: '/sources?rows=1&q=name:' + encodedName });
});

/* Edit an existing source */
router.post("/:id", async function (req, res, next) {
    var query = 'q=id:' + req.params.id;
    var doc = buildDoc(req.body);
    doc.id = req.params.id;

    var oldDoc;
    try {
        var obj = await client.get('select', query);
        oldDoc = obj.response.docs[0];
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Unable to obtain a copy of source to edit for audit log. Source not edited.' });
        return;
    }

    try {
        await client.add(doc);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred during edit submission.' });
        return;
    }

    auditLogger.info(req.user.get("email") + " edited a source:\n" + JSON.stringify(oldDoc) + "\nA Original ||||| Updated V\n" + JSON.stringify(doc));
    req.flash('yay', 'Source successfully edited.');
    res.json({ redirect: url.format({ pathname: "/sources", query: req.query }) });
});

/* Delete a source */
router.delete("/:id", async function (req, res, next) {
    if (req.user.get("permission") < 1) {
        res.redirect(403, "/sources");
        return;
    }

    var id = req.params.id;

    try {
        var doc = await client.deleteByID(id);
        auditLogger.info(req.user.get("email") + " deleted a source:\n" + JSON.stringify(doc));
        req.flash('yay', 'Source successfully deleted.');
        res.json({ redirect: url.format({ pathname: "/sources", query: req.query }) });
    } catch (err) {
        console.log(err);
        req.flash('error', 'A problem occurred during delete submission.');
        res.json({ redirect: '/sources' });
    }
});

module.exports = router;
