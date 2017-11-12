var express = require('express');
var router = express.Router();
var passport = require('../config/passport');

// =====================================
// LOGIN ===============================
// =====================================
// show the login form
router.get('/', function(req, res, next) {
    res.render('login', { message: req.flash('loginMessage') });
});

// process the login form
router.post('/', passport.authenticate('local-login', {
    successRedirect : '/refs', // redirect to the secure profile section
    failureRedirect : '/login', // redirect back to the login page if there is an error
    failureFlash : true // allow flash messages
}));

module.exports = router;