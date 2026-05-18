var express = require('express');
var router = express.Router();
var fs = require("fs");
var SiteContent = require('../models/site-content');
var refTypes = require('../config/refTypes');

/* GET home page. */
router.get('/', async function (req, res, next) {
  var contents = fs.readFileSync("database.json");
  var dbMeta = JSON.parse(contents);
  dbMeta.refTypes = refTypes;
  // Forwarded to the template so the search bar can be pre-filled with the
  // seed on reload; client JS reads ?seed= directly to drive the Solr sort.
  dbMeta.randomSeed = typeof req.query.seed === 'string' ? req.query.seed : null;

  try {
    var sections = await SiteContent.all();
    sections.forEach(function (section) {
      dbMeta[section.section_key] = section.content;
    });
  } catch (err) {
    // If site_content table doesn't exist or is empty, fall back to partials
  }
  res.render('index', dbMeta);
});

router.get('/aggregator.html', function(req, res, next) {
  res.render('printAggregator');
});

module.exports = router;
