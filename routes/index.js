var express = require('express');
var router = express.Router();
var fs = require("fs");
var SiteContent = require('../models/site-content');
var refTypes = require('../config/refTypes');

/* GET home page. */
router.get('/', function(req, res, next) {
  var contents = fs.readFileSync("database.json");
  var dbMeta = JSON.parse(contents);
  dbMeta.refTypes = refTypes;

  SiteContent.fetchAll()
  .then(function (sections) {
    sections.models.forEach(function (section) {
      dbMeta[section.get('section_key')] = section.get('content');
    });
  })
  .catch(function (err) {
    // If site_content table doesn't exist or is empty, fall back to partials
  })
  .finally(function () {
    res.render('index', dbMeta);
  });
});

router.get('/aggregator.html', function(req, res, next) {
  res.render('printAggregator');
});

module.exports = router;
