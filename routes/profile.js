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
    if(req.body.name){
        req.user.set("name", req.body.name);
    } else if (req.body.email) {
        req.user.set("email", req.body.email);
    } else if (req.body.password) {
        req.user.set("password", req.body.password);
    }

    req.user.save()
    .done(function (user){
        res.render('profile', getReplacements(req.user));
    });
    
});

router.delete('/', function (req, res, next){
    req.user.destroy().then(function (user){
        res.end();
    });
});

module.exports = router;