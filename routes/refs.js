var express = require('express');
var router = express.Router();
var fs = require("fs");
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var proxyOpts = require('../config/solr-proxy');
var solr = require('solr-client');
var client = solr.createClient(proxyOpts.backend.host, proxyOpts.backend.port, "rad");
var sourceClient = solr.createClient(proxyOpts.backend.host, proxyOpts.backend.port, "source");
//client.autoCommit = true; //Autocommit is broken apparently.
const url = require('url');

function validateSource(sourceName, callback) {
    sourceClient.get('select', 'q=name:"' + sourceName.replace(/"/g, '\\"') + '"&rows=1', function (err, obj) {
        if (err) {
            callback(err, false);
            return;
        }
        callback(null, obj.response && obj.response.numFound > 0);
    });
}

/* GET home page. */
router.get('/', function (req, res, next) {
    var contents = fs.readFileSync("database.json");
    res.render('refs', Object.assign(req.replacements, JSON.parse(contents)));
});


/*
    Input fields:
    authorField, titleField, dateField, referenceField, sourceField, pageField, abstField

    Output fields
    id, author, title, dt, year, reference, source, page, abstract
 */
router.post('/new', function (req, res, next) {
    // Will create a new one. Does not check for existing references.
    // Can be used to create duplicates

    // Do nothing for empty inputs
    if (!req.body.author && !req.body.title && !req.body.date
        && !req.body.reference && !req.body.source
        && !req.body.page && !req.body.abst) {
        res.status(400).json({ error: 'No data input. Reference not created.' });
        return;
    }

    var doc = {};

    var contents = fs.readFileSync("database.json");
    var dbParams = JSON.parse(contents);
    var newId = dbParams.highestId + 1;
    doc.id = newId;


    // These fields should be sent in already html sanitized. Maybe I should check anyway.
    // Empty fields are OK
    if (req.body.author) { doc.author = req.body.author; }
    if (req.body.title) { doc.title = req.body.title; }
    if (req.body.reference) { doc.reference = req.body.reference; }
    if (req.body.source) { doc.source = req.body.source; }
    if (req.body.page) { doc.page = req.body.page; }
    if (req.body.abst) { doc.abstract = req.body.abst; }

    if (req.body.date) {
        // Validate input date
        var dateRegX = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
        if (!dateRegX.test(req.body.date)) {
            res.status(400).json({ error: 'Incorrect date format entered. Please use ISO 8601.' });
            return;
        }

        var inputDate = new Date(req.body.date);
        doc.dt = req.body.date;
        doc.year = inputDate.getUTCFullYear();
        //doc.date = .... Will start using this field when all fields are made compatible
        var latestRefDate = new Date(dbParams.latest);

        if (latestRefDate < inputDate) {
            var inputDateString = JSON.stringify(inputDate);
            // This might cause a date to be assumed if just year or month entered.
            dbParams.latest = inputDateString.slice(1, inputDateString.search("T"));
        }
    }

    // Send request

    function addReference() {
        client.add(doc, function (err, data) {

            if (err) {
                console.log(err);
                res.status(500).json({ error: 'A problem occurred during submit.' });
            } else { // Success

                // Audit log entry
                auditLogger.info(req.user.get("email") + " added a new reference:\n" + JSON.stringify(doc));

                // Record edit information
                var editDate = new Date();
                var editDateString = JSON.stringify(editDate);
                dbParams.updated = editDateString.slice(1, editDateString.search("T"));
                dbParams.highestId = newId;
                dbParams.numRecords = dbParams.numRecords + 1;

                fs.writeFileSync("database.json", JSON.stringify(dbParams));
                req.flash('yay', 'New reference successfully added.');
                res.json({ redirect: '/refs?rows=1&q=id%3A' + newId });
            }

        });
    }

    if (doc.source) {
        validateSource(doc.source, function (err, exists) {
            if (err) {
                console.log(err);
                // Allow save if source index is unreachable
                addReference();
            } else if (!exists) {
                res.status(400).json({ error: 'Source "' + doc.source + '" not found. Please enter an existing source.' });
            } else {
                addReference();
            }
        });
    } else {
        addReference();
    }

});

router.post("/:id(\\d+)", function (req, res, next) {
    var query = 'q=id:' + req.params.id;

    var contents = fs.readFileSync("database.json");
    var dbParams = JSON.parse(contents);

    var doc = {};
    doc.id = req.params.id;

    // These fields should be sent in already html sanitized. Maybe I should check anyway.
    // Empty fields are OK
    if (req.body.author) { doc.author = req.body.author; }
    if (req.body.title) { doc.title = req.body.title; }
    if (req.body.reference) { doc.reference = req.body.reference; }
    if (req.body.source) { doc.source = req.body.source; }
    if (req.body.page) { doc.page = req.body.page; }
    if (req.body.abst) { doc.abstract = req.body.abst; }

    if (req.body.date) {
        // Validate input date
        var dateRegX = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
        if (!dateRegX.test(req.body.date)) {
            res.status(400).json({ error: 'Incorrect date format entered. Please use ISO 8601.' });
            return;
        }

        var inputDate = new Date(req.body.date);
        doc.dt = req.body.date;
        doc.year = inputDate.getUTCFullYear();
        //doc.date = .... Will start using this field when all fields are made compatible
        var latestRefDate = new Date(dbParams.latest);

        if (latestRefDate < inputDate) {
            var inputDateString = JSON.stringify(inputDate);
            // This might cause a date to be assumed if just year or month entered.
            dbParams.latest = inputDateString.slice(1, inputDateString.search("T"));
        }
    }
    function editReference() {
        client.get('refs', query, function (err, obj) {
            if (err) {
                console.log(err);
                res.status(500).json({ error: 'Unable to obtain a copy of object to edit for audit log. Reference not edited.' });
            } else {
                oldDoc = obj.response.docs[0];

                client.add(doc, function (err, data) {
                    if (err) {
                        console.log(err);
                        res.status(500).json({ error: 'A problem occurred during edit submission.' });
                    } else { // Success

                        // Audit log entry
                        auditLogger.info(req.user.get("email") + " edited a reference:\n" + JSON.stringify(oldDoc) + "\nA Original ||||| Updated V\n" + JSON.stringify(doc));

                        // Record edit information
                        var editDate = new Date();
                        var editDateString = JSON.stringify(editDate);
                        dbParams.updated = editDateString.slice(1, editDateString.search("T"));

                        fs.writeFileSync("database.json", JSON.stringify(dbParams));

                        req.flash('yay', 'Reference successfully edited.');
                        res.json({ redirect: url.format({ pathname: "/refs", query: req.query }) });
                    }

                });
            }
        });
    }

    if (doc.source) {
        validateSource(doc.source, function (err, exists) {
            if (err) {
                console.log(err);
                editReference();
            } else if (!exists) {
                res.status(400).json({ error: 'Source "' + doc.source + '" not found. Please enter an existing source.' });
            } else {
                editReference();
            }
        });
    } else {
        editReference();
    }
});

router.delete("/:id(\\d+)", function (req, res, next) {
    if (req.user.get("permission") < 1) {
        res.redirect(403, "/refs");
    }

    var id = req.params.id;

    var query = 'q=id:' + id;

    var contents = fs.readFileSync("database.json");
    var dbParams = JSON.parse(contents);

    var doc = undefined;
    client.get('refs', query, function (err, obj) {
        if (err) {
            req.flash('error', 'Unable to obtain a copy of object to delete for audit log. Reference not deleted.');
            res.redirect(303, '/refs');
        } else {
            doc = obj.response.docs[0];

            client.deleteByID(id, function (err, data) {
                if (err) {
                    console.log(err);
                    return req.flash('error', 'A problem occurred during delete submission.');
                } else { // Success

                    // Audit log entry
                    auditLogger.info(req.user.get("email") + " deleted a reference:\n" + JSON.stringify(doc));

                    // Record edit information
                    /* 
                     * If the record which was deleted had the entry with the latest date, then 
                     * this will be out of date. There is no way to know that from here, so if
                     * there is an expectation of this being wrong it has to be regenerated elsewhere.
                     */
                    var editDate = new Date();
                    var editDateString = JSON.stringify(editDate);
                    dbParams.updated = editDateString.slice(1, editDateString.search("T"));
                    dbParams.numRecords = dbParams.numRecords - 1;

                    fs.writeFileSync("database.json", JSON.stringify(dbParams));

                    req.flash('yay', 'Reference successfully deleted.');

                }

            });
        }
    });

    res.json({ redirect: url.format({ pathname: "/refs", query: req.query }) });
});


module.exports = router;
