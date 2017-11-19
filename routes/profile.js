var express = require('express');
var router = express.Router();
var validator = require('../config/passValidator');
var mail = require('../config/mailer');

function getReplacements(user, req) {
    var replacements = {};
    replacements.email = user.get("email");
    replacements.dispname = user.get("name")
    replacements.username = user.get("name") || user.get("email");
    replacements.users = user.get("permission") >= 2;
    replacements.message = req.flash("passChangeMessage");
    replacements.nav = 1;
    return replacements;
}

// =====================================
// PROFILE SECTION =====================
// =====================================
// we will want this protected so you have to be logged in to visit
// we will use route middleware to verify this (the isLoggedIn function)
router.get('/', function(req, res, next) {
    res.render('profile', getReplacements(req.user, req));
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
        res.render('profile', getReplacements(req.user, req));
    });
    
});

router.delete('/', function (req, res, next){
    req.user.destroy().then(function (user){
        res.end();
    });
});

router.get('/password', function (req, res, next) {
    res.render('passwordChange', getReplacements(req.user, req));
});

router.post('/password', function (req, res, next) {
    if(req.body.password !== req.body.confirm) {
        req.flash('passChangeMessage', 'Passwords do not match.');
        res.redirect(303, 'back');
        return;
    }
    if(! validator.validate(req.body.password)) {
        req.flash('passChangeMessage', 'Password is not strong enough. Passwords must have 8-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
        res.redirect(303, 'back');
        return;
    }

    req.user.set('password', req.body.password);
    req.user.save()
    .then(function (user){
        mail.sendPassChangeConfirmation(req.user.get('email'));
        req.flash('passChangeMessage', 'Success! Your password has been changed.');
    })
    .catch(function (err){
        console.log(err);
        req.flash('passChangeMessage', 'Something\'s wrong! Your password has not been changed.');
    })
    .finally(function (){
        res.redirect(303,  '/profile');
    });

    
});

module.exports = router;