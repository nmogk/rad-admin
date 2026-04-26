var express = require('express');
var router = express.Router();
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var proxyOpts = require('../config/solr-proxy');
var solr = require('../config/solr-client');
var db = require('../config/database-json');
var client = solr.createClient({ host: proxyOpts.backend.host, port: proxyOpts.backend.port, core: "rad" });
var sourceClient = solr.createClient({ host: proxyOpts.backend.host, port: proxyOpts.backend.port, core: "source" });
const url = require('url');

var DATE_RGX = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;

async function sourceExists(sourceName) {
    var query = 'q=name:"' + sourceName.replace(/"/g, '\\"') + '"&rows=1';
    var obj = await sourceClient.get('select', query);
    return !!(obj.response && obj.response.numFound > 0);
}

function buildDoc(body) {
    var doc = {};
    if (body.author) { doc.author = body.author; }
    if (body.title) { doc.title = body.title; }
    if (body.reference) { doc.reference = body.reference; }
    if (body.source) { doc.source = body.source; }
    if (body.page) { doc.page = body.page; }
    if (body.abst) { doc.abstract = body.abst; }
    return doc;
}

router.get('/', async function (req, res, next) {
    try {
        res.render('refs', Object.assign(req.replacements, await db.read()));
    } catch (err) {
        next(err);
    }
});

/*
    Input fields:
    authorField, titleField, dateField, referenceField, sourceField, pageField, abstField

    Output fields
    id, author, title, dt, year, reference, source, page, abstract
 */
router.post('/new', async function (req, res, next) {
    if (!req.body.author && !req.body.title && !req.body.date
        && !req.body.reference && !req.body.source
        && !req.body.page && !req.body.abst) {
        res.status(400).json({ error: 'No data input. Reference not created.' });
        return;
    }

    var doc = buildDoc(req.body);
    doc.id = await db.reserveId();

    if (req.body.date) {
        if (!DATE_RGX.test(req.body.date)) {
            res.status(400).json({ error: 'Incorrect date format entered. Please use ISO 8601.' });
            return;
        }
        var inputDate = new Date(req.body.date);
        doc.dt = req.body.date;
        doc.year = inputDate.getUTCFullYear();
    }

    if (doc.source) {
        try {
            if (!(await sourceExists(doc.source))) {
                res.status(400).json({ error: 'Source "' + doc.source + '" not found. Please enter an existing source.' });
                return;
            }
        } catch (err) {
            // Allow save if source index is unreachable
            console.log(err);
        }
    }

    try {
        await client.add(doc);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred during submit.' });
        return;
    }

    auditLogger.info(req.user.get("email") + " added a new reference:\n" + JSON.stringify(doc));
    await db.recordInsert(doc.dt);
    req.flash('yay', 'New reference successfully added.');
    res.json({ redirect: '/refs?rows=1&q=id%3A' + doc.id });
});

router.post("/:id(\\d+)", async function (req, res, next) {
    var doc = buildDoc(req.body);
    doc.id = req.params.id;

    if (req.body.date) {
        if (!DATE_RGX.test(req.body.date)) {
            res.status(400).json({ error: 'Incorrect date format entered. Please use ISO 8601.' });
            return;
        }
        var inputDate = new Date(req.body.date);
        doc.dt = req.body.date;
        doc.year = inputDate.getUTCFullYear();
    }

    if (doc.source) {
        try {
            if (!(await sourceExists(doc.source))) {
                res.status(400).json({ error: 'Source "' + doc.source + '" not found. Please enter an existing source.' });
                return;
            }
        } catch (err) {
            console.log(err);
        }
    }

    var oldDoc;
    try {
        var obj = await client.get('refs', 'q=id:' + doc.id);
        oldDoc = obj.response.docs[0];
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Unable to obtain a copy of object to edit for audit log. Reference not edited.' });
        return;
    }

    try {
        await client.add(doc);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred during edit submission.' });
        return;
    }

    auditLogger.info(req.user.get("email") + " edited a reference:\n" + JSON.stringify(oldDoc) + "\nA Original ||||| Updated V\n" + JSON.stringify(doc));
    await db.recordEdit(doc.dt);
    req.flash('yay', 'Reference successfully edited.');
    res.json({ redirect: url.format({ pathname: "/refs", query: req.query }) });
});

router.delete("/:id(\\d+)", function (req, res, next) {
    if (req.user.get("permission") < 1) {
        res.redirect(403, "/refs");
        return;
    }

    var id = req.params.id;

    // Respond immediately; the delete continues in the background.
    res.json({ redirect: url.format({ pathname: "/refs", query: req.query }) });

    client.deleteByID(id).then(async function (doc) {
        auditLogger.info(req.user.get("email") + " deleted a reference:\n" + JSON.stringify(doc));
        await db.recordDelete();
        req.flash('yay', 'Reference successfully deleted.');
    }).catch(function (err) {
        console.log(err);
        req.flash('error', 'A problem occurred during delete submission.');
    });
});


module.exports = router;
