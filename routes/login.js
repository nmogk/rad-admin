var express = require('express');
var router = express.Router();
var passport = require('../config/passport');
var User = require('../models/user');
var Reset = require('../models/invitations');
var mail = require('../config/mailer');
var token = require('../models/tokens');
var log4js = require('log4js');
var appLog = log4js.getLogger('default');

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
        successRedirect: '/refs',
        failureRedirect: '/login',
        failureFlash: true
    })
);

router.post('/forgot', async function (req, res, next) {
    try {
        var user = await User.query().findOne({ email: req.body.email }).throwIfNotFound();
        await token.clearRelated(Promise.resolve(user));
        var tokenData = await token.getToken(1);
        var invite = await Reset.query().insertAndFetch(Object.assign({}, tokenData, { user_id: user.id }));
        await mail.sendResetMail(req, user.email, invite.token);
        appLog.info(`Password reset email sent to: ${req.body.email}`);
        req.flash('login', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
    } catch (err) {
        if (err instanceof User.NotFoundError) {
            appLog.info(`Password reset request by non-user: ${req.body.email}`);
            req.flash('login', 'No account with that email address exists.');
        } else {
            appLog.error(`Problem sending password reset email to: ${req.body.email}`);
            req.flash('login', 'Problem sending reset.');
        }
    } finally {
        res.redirect(303, '/login');
    }
});

module.exports = router;
