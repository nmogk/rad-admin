var express = require('express');
var router = express.Router();
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var proxyOpts = require('../config/solr-proxy');
var solr = require('../server/solr-client');
var db = require('../server/database-json');
var fieldDescriptions = require('../config/fieldDescriptions');
var refTypes = require('../config/refTypes');
var Campaign = require('../models/campaign');

var validTypes = refTypes.map(function (t) { return t.value; });
var client = solr.createClient({ host: proxyOpts.backend.host, port: proxyOpts.backend.port, core: "rad" });
var sourceClient = solr.createClient({ host: proxyOpts.backend.host, port: proxyOpts.backend.port, core: "source" });
const url = require('url');

var DATE_RGX = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;

// Strips non-printing/zero-width chars and normalises common copy-paste
// artefacts (smart quotes, NBSP) so they don't end up in Solr where they'd
// break literal-string searches and visible rendering. Tab, LF, CR are
// intentionally preserved for multi-line abstracts.
// En/em dash and ellipsis normalisation is disabled for now — kept commented
// out so we can switch it back on without re-deriving the rules.
function sanitize(s) {
    if (typeof s !== 'string') { return s; }
    return s
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
        .replace(/[\u00A0\u2028\u2029]/g, ' ')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');
        // .replace(/[\u2013\u2014]/g, '-')
        // .replace(/\u2026/g, '...');
}

async function sourceExists(sourceName) {
    var query = 'q=name:"' + sourceName.replace(/"/g, '\\"') + '"&rows=1';
    var obj = await sourceClient.get('select', query);
    return !!(obj.response && obj.response.numFound > 0);
}

function buildDoc(body) {
    var doc = {};
    if (body.author) { doc.author = sanitize(body.author); }
    if (body.title) { doc.title = sanitize(body.title); }
    if (body.reference) { doc.reference = sanitize(body.reference); }
    if (body.source) { doc.source = sanitize(body.source); }
    if (body.publisher) { doc.publisher = sanitize(body.publisher); }
    if (body.page) { doc.page = sanitize(body.page); }
    if (body.type) { doc.type = body.type; }
    if (body.abst) { doc.abstract = sanitize(body.abst); }
    if (body.rev_author) { doc.rev_author = sanitize(body.rev_author); }
    if (body.rev_title) { doc.rev_title = sanitize(body.rev_title); }
    if (body.rev_source) { doc.rev_source = sanitize(body.rev_source); }
    return doc;
}

router.get('/', async function (req, res, next) {
    try {
        var extras = {
            fieldDocs: fieldDescriptions.refs,
            campaignFieldDocs: fieldDescriptions.campaigns,
            refTypes: refTypes
        };
        // Best-effort active-campaign banner. A bad/missing id just means no
        // banner — don't block the page from rendering.
        if (req.query.campaign && /^\d+$/.test(req.query.campaign)) {
            try {
                var campaign = await Campaign.query().findById(req.query.campaign).throwIfNotFound();
                extras.activeCampaign = {
                    id: campaign.id,
                    name: campaign.name,
                    refCount: (campaign.refs || []).length
                };
            } catch (err) {
                console.log('Active campaign lookup failed:', err && err.message);
            }
        }
        res.render('refs', Object.assign(req.replacements, await db.read(), extras));
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
        && !req.body.reference && !req.body.source && !req.body.publisher
        && !req.body.page && !req.body.type && !req.body.abst
        && !req.body.rev_author && !req.body.rev_title && !req.body.rev_source
        && !req.body.rev_date) {
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

    if (req.body.rev_date) {
        if (!DATE_RGX.test(req.body.rev_date)) {
            res.status(400).json({ error: 'Incorrect reviewed-work date format. Please use ISO 8601.' });
            return;
        }
        doc.rev_date = req.body.rev_date;
    }

    if (doc.type && validTypes.indexOf(doc.type) === -1) {
        res.status(400).json({ error: 'Invalid type "' + doc.type + '". Allowed: ' + validTypes.join(', ') + '.' });
        return;
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

    if (doc.publisher) {
        try {
            if (!(await sourceExists(doc.publisher))) {
                res.status(400).json({ error: 'Publisher "' + doc.publisher + '" not found. Please enter an existing source.' });
                return;
            }
        } catch (err) {
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

    auditLogger.info(req.user.email + " added a new reference:\n" + JSON.stringify(doc));
    await db.recordInsert(doc.dt);
    req.flash('yay', 'New reference successfully added.');
    res.json({ redirect: '/refs?rows=1&q=id%3A' + doc.id });
});

// Fields that the edit endpoint will preserve from the existing Solr doc when
// a body field is missing or null. Empty string in body still means "clear",
// so editors retain the ability to blank a field via the textbox. Date fields
// are handled separately above (they have their own skip-validation-when-
// unchanged path). (#112)
var PRESERVABLE_FIELDS = ['author', 'title', 'reference', 'source', 'publisher',
                          'page', 'type', 'abstract',
                          'rev_author', 'rev_title', 'rev_source'];

// Map Solr field name -> request body key (mirrors buildDoc's mapping).
function bodyKeyFor(solrField) {
    return solrField === 'abstract' ? 'abst' : solrField;
}

router.post("/:id(\\d+)", async function (req, res, next) {
    var doc = buildDoc(req.body);
    doc.id = req.params.id;

    // Fetch the existing doc up front. Needed both for the audit log and so
    // the date validation can skip when the user didn't actually change the
    // date (legacy non-standard dates must not block edits to other fields)
    // and so missing body fields can be preserved rather than silently
    // erased on the full-replace add() below. (#112)
    var oldDoc;
    try {
        var obj = await client.get('refs', 'q=id:' + doc.id);
        oldDoc = (obj.response && obj.response.docs && obj.response.docs[0]) || {};
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Unable to obtain a copy of object to edit for audit log. Reference not edited.' });
        return;
    }

    if (req.body.date !== undefined && req.body.date !== null && req.body.date !== '') {
        if (req.body.date !== oldDoc.dt) {
            if (!DATE_RGX.test(req.body.date)) {
                res.status(400).json({ error: 'Incorrect date format entered. Please use ISO 8601.' });
                return;
            }
            var inputDate = new Date(req.body.date);
            doc.dt = req.body.date;
            doc.year = inputDate.getUTCFullYear();
        } else {
            // Unchanged — preserve as-is (may be a legacy non-standard string
            // that doesn't round-trip through `new Date(...)`). Copy
            // oldDoc.year directly rather than re-deriving.
            doc.dt = oldDoc.dt;
            if (oldDoc.year !== undefined) doc.year = oldDoc.year;
        }
    }

    if (req.body.rev_date !== undefined && req.body.rev_date !== null && req.body.rev_date !== '') {
        if (req.body.rev_date !== oldDoc.rev_date) {
            if (!DATE_RGX.test(req.body.rev_date)) {
                res.status(400).json({ error: 'Incorrect reviewed-work date format. Please use ISO 8601.' });
                return;
            }
            doc.rev_date = req.body.rev_date;
        } else {
            doc.rev_date = oldDoc.rev_date;
        }
    }

    if (doc.type && validTypes.indexOf(doc.type) === -1) {
        res.status(400).json({ error: 'Invalid type "' + doc.type + '". Allowed: ' + validTypes.join(', ') + '.' });
        return;
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

    if (doc.publisher) {
        try {
            if (!(await sourceExists(doc.publisher))) {
                res.status(400).json({ error: 'Publisher "' + doc.publisher + '" not found. Please enter an existing source.' });
                return;
            }
        } catch (err) {
            console.log(err);
        }
    }

    // Defense in depth: a missing body field means "no change", not "clear"
    // — `client.add()` is a full document replace, so anything not in `doc`
    // gets erased from Solr. Apply AFTER source/publisher validation so we
    // don't re-validate orphan sources the user didn't touch. (#112)
    PRESERVABLE_FIELDS.forEach(function (f) {
        if (doc[f] !== undefined) return;
        var bodyVal = req.body[bodyKeyFor(f)];
        if (bodyVal !== undefined && bodyVal !== null) return; // empty string = explicit clear
        if (oldDoc[f] !== undefined) doc[f] = oldDoc[f];
    });

    try {
        await client.add(doc);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred during edit submission.' });
        return;
    }

    auditLogger.info(req.user.email + " edited a reference:\n" + JSON.stringify(oldDoc) + "\nA Original ||||| Updated V\n" + JSON.stringify(doc));
    await db.recordEdit(doc.dt);
    req.flash('yay', 'Reference successfully edited.');
    res.json({ redirect: url.format({ pathname: "/refs", query: req.query }) });
});

router.delete("/:id(\\d+)", async function (req, res, next) {
    if (req.user.permission < 1) {
        res.redirect(403, "/refs");
        return;
    }

    var id = req.params.id;

    try {
        var doc = await client.deleteByID(id);
        auditLogger.info(req.user.email + " deleted a reference:\n" + JSON.stringify(doc));
        await db.recordDelete();
        req.flash('yay', 'Reference successfully deleted.');
        res.json({ redirect: url.format({ pathname: "/refs", query: req.query }) });
    } catch (err) {
        console.log(err);
        req.flash('error', 'A problem occurred during delete submission.');
        res.json({ redirect: '/refs' });
    }
});


module.exports = router;
