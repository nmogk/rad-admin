var express = require('express');
var router = express.Router();
var fs = require("fs");
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var proxyOpts = require('../config/solr-proxy');
var solr = require('solr-client');
var client = solr.createClient(proxyOpts.backend.host, proxyOpts.backend.port, "rad");
//client.autoCommit = true; //Autocommit is broken apparently.

/* GET home page. */
router.get('/', function(req, res, next) {
    var contents = fs.readFileSync("database.json");
    var replacements = JSON.parse(contents);
    replacements.username = req.user.get("name") || req.user.get("email");
    replacements.users = req.user.get("permission") >= 2;
    replacements.deletable = req.user.get("permission") >= 1;
    replacements.message = req.flash("refMessage");
    res.render('refs', replacements);
});


/* Post to root path here will cause an update rather than create a new one */
router.post('/', function(req, res, next) {
    // Need to detect if a new one was posted instead.
    console.log(req.body);
});


/*
    Input fields:
    authorField, titleField, dateField, referenceField, sourceField, pageField, abstField

    Output fields
    id, author, title, dt, year, reference, source, page, abstract
 */
router.post('/new', function(req, res, next){
    // Will create a new one. Does not check for existing references. 
    // Can be used to create duplicates
    
    // Do nothing for empty inputs
    if(!req.body.authorField    && !req.body.titleField && !req.body.dateField 
    && !req.body.referenceField && !req.body.sourceField 
    && !req.body.pageField      && !req.body.abstField)  {
        req.flash('refMessage', 'No data input. Reference not created.');
        res.redirect(400, '/refs');
        return;
    }
    
    var doc = {};

    var contents = fs.readFileSync("database.json");
    var dbParams = JSON.parse(contents);
    
    var newId = dbParams.highestId + 1;
    doc.id = newId;

    
    // These fields should be sent in already html sanitized. Maybe I should check anyway.
    // Empty fields are OK
    if(req.body.authorField){doc.author = req.body.authorField;}
    if(req.body.titleField){doc.title = req.body.titleField;}
    if(req.body.referenceField){doc.reference = req.body.referenceField;}
    if(req.body.sourceField){doc.source = req.body.sourceField;}
    if(req.body.pageField){doc.page = req.body.pageField;}
    if(req.body.abstField){doc.abstract = req.body.abstField;}
    
    if(req.body.dateField){
        // Validate input date
        var dateRegX = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
        if (!dateRegX.test(req.body.dateField)) {
            req.flash('refMessage', 'Incorrect date format entered. Please use ISO 8601.');
            res.redirect(303, '/refs');
            return;
        }
        
        var inputDate = new Date(req.body.dateField);
        doc.dt = req.body.dateField;
        doc.year = inputDate.getUTCFullYear();
        //doc.date = .... Will start using this field when all fields are made compatible
        
        var latestRefDate = new Date(dbParams.latest);

        if(latestRefDate < inputDate) {
            var inputDateString = JSON.stringify(inputDate);
            // This might cause a date to be assumed if just year or month entered.
            dbParams.latest = inputDateString.slice(1, inputDateString.search("T"));
        }
    }

    // Send request

   client.add(doc, function (err, data) {

        if (err) {
            console.log(err);
            req.flash('refMessage', 'A problem occurred during submit.');
        } else {
            // parsed response body as js object
            if (!data.responseHeader.status) { // Success

                client.softCommit();

                // Audit log entry
                auditLogger.info(req.user.get("email") + " added a new reference:\n" + JSON.stringify(doc));

                // Record edit information
                var editDate = new Date();
                var editDateString = JSON.stringify(editDate);
                dbParams.updated = editDateString.slice(1, editDateString.search("T"));
                dbParams.highestId = newId;
                dbParams.numRecords = dbParams.numRecords + 1;

                fs.writeFileSync("database.json", JSON.stringify(dbParams));

                req.flash('refMessage', 'New reference successfully added.');

            } else {
                req.flash('refMessage', 'A problem occurred during submit.');
            }
        }

        res.redirect(303, '/refs');
    });


});

router.post("/:id(\\d+)", function (req, res, next){
    // TBD
});

router.delete("/:id(\\d+)", function (req, res, next) {
    if (req.user.get("permission") < 1) { 
        res.redirect(403, "/refs"); 
    }
    
    // TBD get current values for audit purposes
    var doc = undefined;

    var contents = fs.readFileSync("database.json");
    var dbParams = JSON.parse(contents);

    client.deleteByID(id, function(err,data){
        if(err){
            console.log(err);
            req.flash('refMessage', 'A problem occurred during delete submission.');
        }else{
            // parsed response body as js object
            if (!data.responseHeader.status) { // Success

                client.softCommit();

                // Audit log entry
                auditLogger.info(req.user.get("email") + " reference (ID:"  +  id + ":\n" + JSON.stringify(doc));

                // Record edit information
                var editDate = new Date();
                var editDateString = JSON.stringify(editDate);
                dbParams.updated = editDateString.slice(1, editDateString.search("T"));
                dbParams.numRecords = dbParams.numRecords - 1;

                fs.writeFileSync("database.json", JSON.stringify(dbParams));

                req.flash('refMessage', 'Reference successfully deleted.');

            } else {
                req.flash('refMessage', 'A problem occurred during delete submission.');
            }
        }
        
     });
});


module.exports = router;
