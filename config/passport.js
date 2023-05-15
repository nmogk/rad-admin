var LocalStrategy   = require('passport-local').Strategy;
var User            = require('../models/user');
var passport        = require('passport');
var validator       = require('../config/passValidator');

// =========================================================================
// passport session setup ==================================================
// =========================================================================
// required for persistent login sessions
// passport needs ability to serialize and unserialize users out of session

// used to serialize the user for the session
passport.serializeUser(function(user, done) {
    done(null, user.id);
});

// used to deserialize the user
passport.deserializeUser(function(id, done) {
    new User({'id': id})
        .fetch()
        .then(function (user){
            done(null, user);
        })
        .catch(function (err){
            done(err);
        })
});


// =========================================================================
// LOCAL SIGNUP ============================================================
// =========================================================================
// we are using named strategies since we have one for login and one for signup
// by default, if there was no name, it would just be called 'local'
passport.use('local-signup', new LocalStrategy({
    // by default, local strategy uses username and password, we will override with email
    usernameField : 'email',
    passwordField : 'password',
    passReqToCallback : true // allows us to pass back the entire request to the callback
},
function(req, email, password, done) {
    let user = new User({email: email});
    user.fetch()
    .then(function (user){
        return done(null, false, req.flash('login', 'That email is already taken.'));
    })
    .catch(function (err){
        if(! validator.validate(password)) {
            return done(null, false, req.flash('login', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.'));
        }
        user.set({password: password});
        user.save() // {method: 'insert'}
        .then(function (user){
            return done(null, user);
        })
        .catch(function (err){
            return  done(err);
        });
    });
    
}));

// =========================================================================
// LOCAL LOGIN =============================================================
// =========================================================================
// we are using named strategies since we have one for login and one for signup
// by default, if there was no name, it would just be called 'local'

passport.use('local-login', new LocalStrategy({
    // by default, local strategy uses username and password, we will override with email
    usernameField : 'email',
    passwordField : 'password',
    passReqToCallback : true // allows us to pass back the entire request to the callback
},
function(req, email, password, done) { // callback with email and password from our form

    // find a user whose email is the same as the forms email
    // we are checking to see if the user trying to login already exists
    (new User({email: email})).fetch()
    .then(function (user) {
        return user.authenticate(password);
        
    //     .catch(function (err){
    //         // if the user is found but the password is wrong
    //         return done(null, false, req.flash('loginMessage', 'Oops! Wrong password.')); // create the loginMessage and save it to session as flashdata
    //     })
    })
    .then(function (user){
        return done(null, user);
    })
    .catch(function (err){
        return done(null, false, req.flash('loginMessage', 'Unable to log in. Please check your email and password.'));
    });


}));

module.exports =  passport;