var express = require('express');
var router = express.Router();

// =====================================
// PROFILE SECTION =====================
// =====================================
// we will want this protected so you have to be logged in to visit
// we will use route middleware to verify this (the isLoggedIn function)
router.get('/', function(req, res, next) {
    var replacements = {};
    replacements.email = req.user.get("email");
    replacements.dispname = req.user.get("name")
    replacements.username = req.user.get("name") || req.user.get("email");
    replacements.users = req.user.get("permission") >= 2;
    res.render('profile', replacements);
});

module.exports = router;