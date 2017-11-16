var express = require('express');
var router = express.Router();
var passport = require('../config/passport');
var nodemailer = require('nodemailer');
var async = require('async');
var User = require('../models/user');
var Reset = require('../models/invitations');
var Promise = require('bluebird');
var crypto = Promise.promisifyAll(require('crypto'));
var aws = require('../config/aws');

// =====================================
// LOGIN ===============================
// =====================================
// show the login form
router.get('/', function(req, res, next) {
    res.render('login', { message: req.flash('loginMessage') });
});

// process the login form
router.post('/', passport.authenticate('local-login', 
        {
            successRedirect : '/refs', // redirect to the secure profile section
            failureRedirect : '/login', // redirect back to the login page if there is an error
            failureFlash : true // allow flash messages
        })
    ); 

router.post('/forgot', function (req, res, next) {
    crypto.randomBytesAsync(20)
    .then(function (buf) {
        var token = buf.toString('hex');
        return new Reset(
            {
                token: token, 
                expires: new Date() + 3600000 // 1 hour
            }
        )
    })
    .then(function (invite) {
        new User({email: email}).fetch({require: true})
        .then(function (user){
            return invite.attach(user);
        })
        .catch(function (err){
            req.flash('error', 'No account with that email address exists.');
            return res.redirect('/login');
        });
    })
    .then(function (invite){
        return invite.save();
    })
    .then(function (invite){
        // Email stuff
        let user = invite.related('user');
        var sesTransporter = nodemailer.createTransport({
            SES: new aws.SES()
        });
        var mailOptions = {
          to: user.email,
          from: 'passwordreset@rad.creationeducation.org',
          subject: 'Account Password Reset',
          text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
            'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
            'https://' + req.get('Host') + '/reset/' + invite.token + '\n\n' +
            'If you did not request this, please ignore this email and your password will remain unchanged.\n'
        };
        sesTransporter.sendMail(mailOptions, function(err) {
          req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
        });
    })
    .catch(function (err) {
        return next(err);
    });

    res.redirect('/login');
    
});

module.exports = router;