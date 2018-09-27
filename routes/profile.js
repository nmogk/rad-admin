var express = require('express');
var router = express.Router();
var validator = require('../config/passValidator');
var mail = require('../config/mailer');
var tokens = require('../models/tokens');
var Promise = require('bluebird');

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
        req.user.set("email", req.body.email);
    } else if (req.body.password) {
        req.user.set("password", req.body.password);
    }

    req.user.save()
    .done(function (user){
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