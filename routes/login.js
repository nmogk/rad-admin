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
    Promise.all(
        [
            crypto.randomBytesAsync(20)
            .then(function (buf) {
                var token = buf.toString('hex');
                let date = new Date();
                date.setHours(date.getHours() + 1);
                return new Reset(
                    {
                        token: token, 
                        expires: date
                    }
                )
            }),

            new User({email: req.body.email}).fetch({require: true})
        ]
    )
    .spread(function (invite, user){
        invite.set('user_id', user.id).save();
        
        // Email stuff
        return mail.sendResetMail(req, user.get('email'), invite.get('token'));  
    })
    .then(function (){
        req.flash('loginMessage', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
        res.redirect(303, '/login');
    })    
    .catch(User.NotFoundError, function (err){
        req.flash('loginMessage', 'No account with that email address exists.');
        res.redirect(303, '/login');
    })
    .catch(function (err) {
        console.log(err);
        req.flash('loginMessage', 'Problem sending reset.');
        res.redirect(303, '/login');
    });

    
    
});

module.exports = router;