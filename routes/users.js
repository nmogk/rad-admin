var express = require('express');
var router = express.Router();
var User = require('../models/user');
var Invite = require('../models/invitations');
var tokens = require('../models/tokens');
var mail = require('../config/mailer');

// GET users listing.
router.get('/', function (req, res, next) {
  req.replacements.currentUserId = req.user.id;
  res.render('users', req.replacements);
});

// RESTful endpoint for getting an array of users in json format
router.get('/all', async function (req, res, next) {
  try {
    var users = await User.query();
    var data = users.map(function (u) {
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        permission: u.permission,
        validated: u.validated,
        last_login: u.last_login
      };
    });
    res.jsonp(data);
  } catch (err) {
    next(err);
  }
});

router.post('/invite', async function (req, res, next) {
  if (!req.body.newUserEmail) {
    req.flash('error', 'No email specified');
    res.redirect(303, '/users');
    return;
  }

  var newUserPass = tokens.randomHexString();

  try {
    var existing = await User.query().findOne({ email: req.body.newUserEmail });
    if (existing) {
      req.flash('error', 'User already exists. New user not created.');
      res.redirect(303, '/users');
      return;
    }

    var user = await User.query().insertAndFetch({
      email: req.body.newUserEmail,
      password: newUserPass
    });
    var tokenData = await tokens.getToken(24);
    var invite = await Invite.query().insertAndFetch(Object.assign({}, tokenData, { user_id: user.id }));

    await mail.sendInviteMail(req, user.email, invite.token);
  } catch (err) {
    if (err instanceof mail.MailError) {
      req.flash('error', 'Invitation not sent. ' + err.message);
    } else {
      console.log(err);
      req.flash('error', 'Problem creating invitation.');
    }
  } finally {
    res.redirect(303, '/users');
  }
});

// Allows the superuser to refresh an invitation. Replaces any prior token for
// the same user (clearRelated) and issues a fresh 24-hour one.
router.post('/resend/:id(\\d+)', async function (req, res, next) {
  try {
    var user = await User.query().findById(req.params.id).throwIfNotFound();
    await tokens.clearRelated(Promise.resolve(user));
    var tokenData = await tokens.getToken(24);
    var invite = await Invite.query().insertAndFetch(Object.assign({}, tokenData, { user_id: user.id }));
    await mail.sendInviteMail(req, user.email, invite.token);
    req.flash('info', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
  } catch (err) {
    if (err instanceof User.NotFoundError) {
      req.flash('error', 'No account with that email address exists.');
    } else if (err instanceof mail.MailError) {
      req.flash('error', 'Invitation not resent. ' + err.message);
    } else {
      console.log(err);
      req.flash('error', 'Problem resending invite.');
    }
  } finally {
    res.json({ redirect: '/users' });
  }
});

// Updating permissions for user
router.post('/:id(\\d+)/:level(\\d+)', async function (req, res, next) {
  var level = parseInt(req.params.level, 10);
  if (level < 0 || level > 2) {
    req.flash('error', 'Invalid permission level');
    res.redirect(303, '/users');
    return;
  }

  try {
    var n = await User.query().findById(req.params.id).patch({ permission: level });
    if (!n) throw new Error('not found');
    req.flash('yay', 'User permissions successfully updated');
  } catch (err) {
    req.flash('error', 'Problem updating user');
  } finally {
    res.json({ redirect: '/users' });
  }
});

// Delete a particular user
router.delete('/:id(\\d+)', async function (req, res, next) {
  var isSelf = req.user.id === parseInt(req.params.id, 10);
  try {
    var user = await User.query().findById(req.params.id).throwIfNotFound();
    await tokens.clearRelated(Promise.resolve(user));
    await user.$query().delete();
    if (isSelf) {
      req.logout(function (err) {
        res.json({ redirect: '/login' });
      });
      return;
    }
    req.flash('yay', 'User successfully deleted');
    res.json({ redirect: '/users' });
  } catch (err) {
    console.log(err);
    req.flash('error', 'Problem deleting user');
    res.json({ redirect: '/users' });
  }
});

module.exports = router;
