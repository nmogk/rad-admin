var express = require('express');
var router = express.Router();
var fs = require("fs");

/* GET home page. */
router.get('/', function(req, res, next) {
    var contents = fs.readFileSync("database.json");
    var dbMeta = JSON.parse(contents);
    dbMeta.username = req.user.get("name") || req.user.get("email");
    dbMeta.users = req.user.get("permission") >= 2;
    res.render('refs', dbMeta);
});

module.exports = router;
