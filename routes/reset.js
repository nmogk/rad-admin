var express = require('express');
var router = express.Router();
var ResetToken = require('../models/invitations');
var mail = require('../config/mailer');
var validator       = require('../config/passValidator');
var Promise = require('bluebird');

router.get('/', function(req, res){
    res.redirect('/login');
})

router.get('/:token', function(req, res) {
    new ResetToken({token: req.params.token})
    .where('expires', '>', Date.now())
    .fetch({required: true, withRelated: 'user'})
    .then(function (token) {
        let user = token.related('user');
        res.render('passwordChange', {message: req.flash('passChangeMessage')});
    })
    .catch(function (err){
        req.flash('loginMessage', 'Password reset token is invalid or has expired.');
        res.redirect('/login');
    });
});

router.post('/:token', function(req, res) {
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

    var tokenPromise = new ResetToken({token: req.params.token})
    .where('expires', '>', Date.now())
    .fetch({required: true, withRelated: 'user'})
    .catch(function (err){
        req.flash('loginMessage', 'Password reset token is invalid or has expired.');
        res.redirect(303, '/login');
        throw err;
    });

    var userPromise = tokenPromise.then(function (token) {
        
        let user = token.related('user');
        user.set('password', req.body.password);
        return user.save();
    });

    Promise.join(tokenPromise, userPromise, function(token, user){
        mail.sendPassChangeConfirmation(user.get('email'));
        req.flash('loginMessage', 'Success! Your password has been changed.');
        token.destroy();
    })
    .finally(function (){
        res.redirect(303, '/login');
    });

});

module.exports = router;