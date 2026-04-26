var express = require('express');
var router = express.Router();
var validator = require('../config/passValidator');
var mail = require('../config/mailer');
var tokens = require('../models/tokens');
var ResetToken = require('../models/invitations');

// =====================================
// PROFILE SECTION =====================
// =====================================
// we will want this protected so you have to be logged in to visit
// we will use route middleware to verify this (the isLoggedIn function)
router.get('/', function(req, res, next) {
    res.render('profile', req.replacements);
});

router.post('/', function(req, res, next) {
    if(req.body.name){
        req.user.set("name", req.body.name);
    } else if (req.body.email) {
        var newEmail = req.body.email.trim();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            req.flash('error', 'Please enter a valid email address.');
            res.redirect(303, '/profile');
            return;
        }
        if(newEmail === req.user.get('email')) {
            req.flash('error', 'New email is the same as current email.');
            res.redirect(303, '/profile');
            return;
        }
        var oldEmail = req.user.get('email');
        var userPromise = Promise.resolve(req.user);
        req.user.set('pending_email', newEmail);
        Promise.all([tokens.getToken(24), req.user.save(), tokens.clearRelated(userPromise)])
        .then(function (results) {
            var invite = results[0];
            invite.set('user_id', req.user.id).save(null, { method: 'insert' });
            return Promise.all([
                mail.sendEmailVerification(req, newEmail, invite.get('token')),
                mail.sendEmailChangeNotice(oldEmail, newEmail)
            ]);
        })
        .then(function () {
            req.flash('info', 'A verification email has been sent to ' + newEmail + '. Please check your inbox to confirm the change.');
        })
        .catch(function (err) {
            console.log(err);
            req.flash('error', 'Problem initiating email change.');
        })
        .finally(function () {
            res.redirect(303, '/profile');
        });
        return;
    } else if (req.body.password) {
        if(! validator.validate(req.body.password)) {
            req.flash('error', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
            res.redirect(303, '/profile');
            return;
        }
        req.user.set("password", req.body.password);
    }

    req.user.save()
    .then(function (user){
        // Refresh display name so the change is visible immediately
        var updatedName = req.user.get("name");
        req.replacements.dispname = updatedName;
        req.replacements.username = updatedName || req.user.get("email");
        res.render('profile', req.replacements);
    });

});

router.delete('/', function (req, res, next){
    tokens.clearRelated(Promise.resolve(req.user))
    .then(function (clear){
        req.user.destroy()
        res.end();
    });
});

router.get('/verify/:token', function (req, res, next) {
    new ResetToken({token: req.params.token})
    .where('expires', '>', Date.now())
    .fetch({withRelated: 'user'})
    .then(function (token) {
        var user = token.related('user');
        var pendingEmail = user.get('pending_email');
        if(!pendingEmail) {
            req.flash('error', 'No pending email change found.');
            res.redirect(303, '/profile');
            return;
        }
        user.set('email', pendingEmail);
        user.set('pending_email', null);
        return user.save()
        .then(function () {
            token.destroy();
            req.flash('yay', 'Your email has been changed to ' + pendingEmail + '.');
            res.redirect(303, '/profile');
        });
    })
    .catch(function (err) {
        req.flash('error', 'Email verification link is invalid or has expired.');
        res.redirect(303, '/profile');
    });
});

router.get('/password', function (req, res, next) {
    res.render('passwordChange', req.replacements);
});

router.post('/password', function (req, res, next) {
    if(req.body.password !== req.body.confirm) {
        req.flash('error', 'Passwords do not match.');
        res.redirect(303, 'back');
        return;
    }
    if(! validator.validate(req.body.password)) {
        req.flash('error', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
        res.redirect(303, 'back');
        return;
    }

    req.user.set('password', req.body.password);
    req.user.save()
    .then(function (user){
        mail.sendPassChangeConfirmation(req.user.get('email'));
        req.flash('yay', 'Success! Your password has been changed.');
    })
    .catch(function (err){
        console.log(err);
        req.flash('error', 'Something\'s wrong! Your password has not been changed.');
    })
    .finally(function (){
        res.redirect(303,  '/profile');
    });

    
});

module.exports = router;