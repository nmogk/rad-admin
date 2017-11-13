var express = require('express');
var router = express.Router();

function getReplacements(user) {
    var replacements = {};
    replacements.email = user.get("email");
    replacements.dispname = user.get("name")
    replacements.username = user.get("name") || user.get("email");
    replacements.users = user.get("permission") >= 2;
    return replacements;
}

// =====================================
// PROFILE SECTION =====================
// =====================================
// we will want this protected so you have to be logged in to visit
// we will use route middleware to verify this (the isLoggedIn function)
router.get('/', function(req, res, next) {
    res.render('profile', getReplacements(req.user));
});

router.post('/', function(req, res, next) {
    if(req.updateField === 'password' || req.updateField === 'email' || req.updateField === 'name'){
        req.user.set(updateField, updateValue);
        req.user.save()
        .then(res.render('profile', getReplacements(req.user)));
    }
});

module.exports = router;