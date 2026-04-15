var express = require('express');
var router = express.Router();
var User = require('../models/user');
var _ = require('lodash');
var tokens = require('../models/tokens');
var Invite = require('../models/invitations');
var mail = require('../config/mailer');

// GET users listing.
router.get('/', function (req, res, next) {
  req.replacements.currentUserId = req.user.id;
  res.render('users', req.replacements);
});

// RESTful endpoint for getting an array of users in json format 
router.get('/all', function (req, res, next) {
  usersJson = [];

  usersPromise = User.fetchAll();

  usersPromise.then(function (usersList) {
    _.each(usersList.models, function (user) {
      usersJson.push({
        id: user.get("id"),
        email: user.get("email"),
        name: user.get("name"),
        permission: user.get("permission"),
        validated: user.get("validated"),
        last_login: user.get("last_login")
      }); // Unpack user object, dropping password_digest
    })
  })
    .then(function () {
      res.jsonp(usersJson);
    })

});

// 
router.post('/invite', function (req, res, next) {
  console.log(req.body);
  if (!req.body.newUserEmail) {
    req.flash('error', 'No email specified');
    res.redirect(400, '/users');
    return;
  }

  newUserPass = tokens.randomHexString();

  // If invitation resends don't work, this call is likely to blame.
  // This will fail if there is already an invite
  newUserPromise = new User({ email: req.body.newUserEmail, password: newUserPass }).save(null, { method: "insert" });

  Promise.all([tokens.getToken(24), newUserPromise, tokens.clearRelated(newUserPromise)])
  .then(function (results) {
    var invite = results[0], user = results[1];
    invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

    return mail.sendInviteMail(req, user.get('email'), invite.get('token'));
  })
    .catch(function (err) {
      if (err instanceof User.NoRowsUpdatedError) { // User was not saved in database
        req.flash('error', 'User already exists. New user not created.');
        return;
      }
      console.log(err);
      req.flash('error', 'Problem resending invite.');
    })
    .finally(function () { // All responses get redirected to /login to display flash message
      res.redirect(303, '/users'); // 303 ensures that the client uses GET rather than POST.
    });

});

// Allows the superuser to refresh an invitation, the save command should trigger an update
// with the new password. This will essentially be a forced administrative password reset.
router.post('/resend/:id(\\d+)', function (req, res, next) {
  // Fetch the user from the given email. This will happen only once, and this promise will be reused
  // If the user is not found, then it will throw a User.NotFoundError which is caught below.
  var userPromise = new User({ id: req.params.id }).fetch()

  // Wait for all the ingredients to return before using them
  Promise.all([tokens.getToken(24), userPromise, tokens.clearRelated(userPromise)])
    .then(function (results) {
      var invite = results[0], user = results[1];
      invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

      return mail.sendInviteMail(req, user.get('email'), invite.get('token'));
    })
    .then(function () { // Success
      req.flash('info', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
    })
    .catch(function (err) {
      if (err instanceof User.NotFoundError) { // Reset attempted with wrong account
        req.flash('error', 'No account with that email address exists.');
        return;
      }
      console.log(err);
      req.flash('error', 'Problem resending invite.');
    })
    .finally(function () { // All responses get redirected to /login to display flash message
      res.json({ redirect: '/users' });
    });
});

// Updating permissions for user 
router.post('/:id(\\d+)/:level(\\d+)', function (req, res, next) {
  if (req.params.level < 0 || req.params.level > 2) {
    req.flash('error', 'Invalid permission level');
    res.redirect(400, '/users');
    return;
  }

  new User({ id: req.params.id }).fetch()
    .then(function (user) {
      return user
        .set('permission', req.params.level)
        .save();
    })
    .then(function (user) {
      req.flash('yay', 'User permissions successfully updated');
    })
    .catch(function (err) {
      req.flash('error', 'Problem updating user');
    })
    .finally(function () {
      res.json({ redirect: '/users' });
    });

});

// Delete a particular user
router.delete('/:id(\\d+)', function (req, res, next) {
  var isSelf = req.user.id === parseInt(req.params.id, 10);
  var userPromise = new User({ id: req.params.id }).fetch()
  Promise.all([userPromise, tokens.clearRelated(userPromise)])
    .then(function (results) {
      return results[0].destroy();
    })
    .then(function (user) {
      if (isSelf) {
        req.logout(function (err) {
          res.json({ redirect: '/login' });
        });
        return;
      }
      req.flash('yay', 'User successfully deleted');
      res.json({ redirect: '/users' });
    })
    .catch(function (err) {
      console.log(err);
      req.flash('error', 'Problem deleting user');
      res.json({ redirect: '/users' });
    });
});

module.exports = router;
