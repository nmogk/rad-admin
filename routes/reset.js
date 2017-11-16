var express = require('express');
var router = express.Router();
var ResetToken = require('../models/invitations');
var mail = require('../config/mailer');
var validator       = require('../config/passValidator');

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
        return res.redirect('/login');
    });
});

router.post('/:token', function(req, res) {
    new ResetToken({token: req.params.token})
    .where('expires', '>', Date.now())
    .fetch({required: true, withRelated: 'user'})
    .then(function (token) {
        if(req.body.password !== req.body.confirm) {
            req.flash('passChangeMessage', 'Passwords do not match.');
            return res.redirect('/reset');
        }
        if(! validator.validate(req.body.password)) {
            req.flash('passChangeMessage', 'Password is not strong enough. Passwords must have 8-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
            return res.redirect('/reset');
        }
        let user = token.related('user');
        user.password = req.body.password;
        user.save()
        .then(function (user){
            mail.sendPassChangeConfirmation(user.email);
            req.flash('loginMessage', 'Success! Your password has been changed.');
            res.redirect('/login');
        });
        token.destroy();
    })
    .catch(function (err){
        req.flash('loginMessage', 'Password reset token is invalid or has expired.');
        return res.redirect('/login');
    });

});

module.exports = router;