var express = require('express');
var router = express.Router();
var validator = require('../config/passValidator');
var mail = require('../config/mailer');
var tokens = require('../models/tokens');
var ResetToken = require('../models/invitations');

// =====================================
// PROFILE SECTION =====================
// =====================================
// Protected by isLoggedIn middleware mounted in app.js.
router.get('/', function (req, res, next) {
    res.render('profile', req.replacements);
});

router.post('/', async function (req, res, next) {
    if (req.body.email) {
        var newEmail = req.body.email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            req.flash('error', 'Please enter a valid email address.');
            res.redirect(303, '/profile');
            return;
        }
        if (newEmail === req.user.email) {
            req.flash('error', 'New email is the same as current email.');
            res.redirect(303, '/profile');
            return;
        }
        var oldEmail = req.user.email;
        try {
            await req.user.$query().patch({ pending_email: newEmail });
            await tokens.clearRelated(Promise.resolve(req.user));
            var tokenData = await tokens.getToken(24);
            var invite = await ResetToken.query().insertAndFetch(Object.assign({}, tokenData, { user_id: req.user.id }));
            await Promise.all([
                mail.sendEmailVerification(req, newEmail, invite.token),
                mail.sendEmailChangeNotice(oldEmail, newEmail)
            ]);
            req.flash('info', 'A verification email has been sent to ' + newEmail + '. Please check your inbox to confirm the change.');
        } catch (err) {
            console.log(err);
            req.flash('error', 'Problem initiating email change.');
        }
        res.redirect(303, '/profile');
        return;
    }

    if (req.body.password) {
        if (!validator.validate(req.body.password)) {
            req.flash('error', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
            res.redirect(303, '/profile');
            return;
        }
        await req.user.$query().patch({ password: req.body.password });
    } else if (req.body.name) {
        await req.user.$query().patch({ name: req.body.name });
        req.user.name = req.body.name;
    }

    req.replacements.dispname = req.user.name;
    req.replacements.username = req.user.name || req.user.email;
    res.render('profile', req.replacements);
});

router.delete('/', async function (req, res, next) {
    await tokens.clearRelated(Promise.resolve(req.user));
    await req.user.$query().delete();
    res.end();
});

router.get('/verify/:token', async function (req, res, next) {
    try {
        var token = await ResetToken.query()
            .findById(req.params.token)
            .where('expires', '>', new Date())
            .withGraphFetched('user')
            .throwIfNotFound();
        var user = token.user;
        var pendingEmail = user.pending_email;
        if (!pendingEmail) {
            req.flash('error', 'No pending email change found.');
            res.redirect(303, '/profile');
            return;
        }
        await user.$query().patch({ email: pendingEmail, pending_email: null });
        await token.$query().delete();
        req.flash('yay', 'Your email has been changed to ' + pendingEmail + '.');
        res.redirect(303, '/profile');
    } catch (err) {
        req.flash('error', 'Email verification link is invalid or has expired.');
        res.redirect(303, '/profile');
    }
});

router.get('/password', function (req, res, next) {
    res.render('passwordChange', req.replacements);
});

router.post('/password', async function (req, res, next) {
    if (req.body.password !== req.body.confirm) {
        req.flash('error', 'Passwords do not match.');
        res.redirect(303, 'back');
        return;
    }
    if (!validator.validate(req.body.password)) {
        req.flash('error', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
        res.redirect(303, 'back');
        return;
    }

    try {
        await req.user.$query().patch({ password: req.body.password });
        mail.sendPassChangeConfirmation(req.user.email);
        req.flash('yay', 'Success! Your password has been changed.');
    } catch (err) {
        console.log(err);
        req.flash('error', 'Something\'s wrong! Your password has not been changed.');
    } finally {
        res.redirect(303, '/profile');
    }
});

module.exports = router;
