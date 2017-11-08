var express = require('express');
var router = express.Router();
var fs = require("fs");

/* GET home page. */
router.get('/', function(req, res, next) {
    var contents = fs.readFileSync("database.json");
    var dbMeta = JSON.parse(contents);
    res.render('refs', dbMeta);
});

module.exports = router;
