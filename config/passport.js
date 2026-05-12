var LocalStrategy   = require('passport-local').Strategy;
var User            = require('../models/user');
var passport        = require('passport');
var validator       = require('../config/passValidator');
var log4js          = require('log4js');
var appLog          = log4js.getLogger('default');

// =========================================================================
// passport session setup ==================================================
// =========================================================================
// required for persistent login sessions
// passport needs ability to serialize and unserialize users out of session

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(async function (id, done) {
    try {
        var user = await User.query().findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// =========================================================================
// LOCAL SIGNUP ============================================================
// =========================================================================
passport.use('local-signup', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
}, async function (req, email, password, done) {
    try {
        var existing = await User.query().findOne({ email: email });
        if (existing) {
            return done(null, false, req.flash('login', 'That email is already taken.'));
        }
        if (!validator.validate(password)) {
            return done(null, false, req.flash('login', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.'));
        }
        var user = await User.query().insertAndFetch({
            email: email,
            password: password,
            last_login: new Date()
        });
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// =========================================================================
// LOCAL LOGIN =============================================================
// =========================================================================
passport.use('local-login', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
}, async function (req, email, password, done) {
    try {
        var user = await User.query().findOne({ email: email }).throwIfNotFound();
        await user.authenticate(password);
        appLog.info(`${email} logged in`);
        await user.$query().patch({ last_login: new Date() });
        return done(null, user);
    } catch (err) {
        appLog.debug(`Failed login attempt: ${email}`);
        return done(null, false, req.flash('login', 'Unable to log in. Please check your email and password.'));
    }
}));

module.exports = passport;
