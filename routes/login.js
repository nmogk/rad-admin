var express = require('express');
var router = express.Router();
var passport = require('../config/passport');
var nodemailer = require('nodemailer');
var async = require('async');
var User = require('../models/user');
var Reset = require('../models/invitations');
var Promise = require('bluebird');
var crypto = Promise.promisifyAll(require('crypto'));
var mail = require('../config/mailer');
var token = require('../models/tokens');

// =====================================
// LOGIN ===============================
// =====================================
// show the login form
router.get('/', function (req, res, next) {
    res.render('login', { errorMessage: req.flash('login') });
});

// process the login form
router.post('/', passport.authenticate('local-login',
    {
        successRedirect: '/refs', // redirect to the secure profile section
        failureRedirect: '/login', // redirect back to the login page if there is an error
        failureFlash: true // allow flash messages
    })
);

router.post('/forgot', function (req, res, next) {

    // Fetch the user from the given email. This will happen only once, and this promise will be reused
    // If the user is not found, then it will throw a User.NotFoundError which is caught below.
    var userPromise = new User({ email: req.body.email }).fetch({ require: true })

    // Wait for all the ingredients to return before using them
    Promise.join(token.getToken(1), userPromise, token.clearRelated(userPromise),
        function (invite, user, clear) {
            invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

            return mail.sendResetMail(req, user.get('email'), invite.get('token'));
        })
        .then(function () { // Success
            return req.flash('login', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
        })
        .catch(User.NotFoundError, function (err) { // Reset attempted with wrong account
            return req.flash('login', 'No account with that email address exists.');
        })
        .catch(function (err) { // Other errors
            console.log(err);
            return req.flash('login', 'Problem sending reset.');
        })
        .finally(function () { // All responses get redirected to /login to display flash message
            res.redirect(303, '/login'); // 303 ensures that the client uses GET rather than POST.
        });

});

module.exports = router;