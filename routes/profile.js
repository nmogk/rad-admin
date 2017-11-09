var express = require('express');
var router = express.Router();

// =====================================
// PROFILE SECTION =====================
// =====================================
// we will want this protected so you have to be logged in to visit
// we will use route middleware to verify this (the isLoggedIn function)
router.get('/', function(req, res, next) {
    res.render('profile', { user: req.user });
});

module.exports = router;