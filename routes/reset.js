var express = require('express');
var router = express.Router();
var ResetToken = require('../models/invitations');
var mail = require('../config/mailer');
var validator = require('../config/passValidator');

router.get('/', function (req, res) {
    res.redirect(302, '/login');
});

router.get('/:token', async function (req, res) {
    try {
        await ResetToken.query()
            .findById(req.params.token)
            .where('expires', '>', new Date())
            .throwIfNotFound();
        res.render('passwordChange', { errorMessage: req.flash('login') });
    } catch (err) {
        req.flash('login', 'Password reset token is invalid or has expired.');
        res.redirect(303, '/login');
    }
});

router.post('/:token', async function (req, res) {
    if (req.body.password !== req.body.confirm) {
        req.flash('login', 'Passwords do not match.');
        res.redirect(303, 'back');
        return;
    }
    if (!validator.validate(req.body.password)) {
        req.flash('login', 'Password is not strong enough. Passwords must have 9-72 characters and contain at least one numeral, uppercase, and lowercase letters.');
        res.redirect(303, 'back');
        return;
    }

    try {
        var token = await ResetToken.query()
            .findById(req.params.token)
            .where('expires', '>', new Date())
            .withGraphFetched('user')
            .throwIfNotFound();
        var user = token.user;
        await user.$query().patch({ password: req.body.password, validated: '1' });
        mail.sendPassChangeConfirmation(user.email);
        req.flash('login', 'Success! Your password has been changed.');
        await token.$query().delete();
    } catch (err) {
        req.flash('login', 'Password reset token is invalid or has expired.');
    } finally {
        res.redirect(303, '/login');
    }
});

module.exports = router;
