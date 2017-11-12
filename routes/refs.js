var express = require('express');
var router = express.Router();
var fs = require("fs");

/* GET home page. */
router.get('/', function(req, res, next) {
    var contents = fs.readFileSync("database.json");
    var replacements = JSON.parse(contents);
    replacements.username = req.user.get("name") || req.user.get("email");
    replacements.users = req.user.get("permission") >= 2;
    res.render('refs', replacements);
});

module.exports = router;
