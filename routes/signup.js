var express = require('express');
var router = express.Router();
var passport = require('../config/passport');

// =====================================
// SIGNUP ==============================
// =====================================

// show the signup form

router.get('/', function(req, res, next) {
    res.render('signup', { errorMessage: req.flash('login') });
});

// process the signup form
router.post('/', passport.authenticate('local-signup', {
    successRedirect : '/profile', // redirect to the secure profile section
    failureRedirect : '/signup', // redirect back to the signup page if there is an error
    failureFlash : true // allow flash messages
}));

module.exports = router;