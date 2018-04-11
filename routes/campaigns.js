var express = require('express');
var router = express.Router();

function getReplacements(req) {
    var replacements = {};
    let user = req.user;
    replacements.username = user.get("name") || user.get("email");
    replacements.users = user.get("permission") >= 2;
    return replacements;
}

router.get('/', function(req, res, next) {
    res.render('campaigns', getReplacements(req));
});

module.exports = router;