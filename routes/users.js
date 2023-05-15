var express = require('express');
var router = express.Router();
var User = require('../models/user');
var Promise = require('bluebird');
var _ = require('lodash');
var tokens = require('../models/tokens');
var Invite = require('../models/invitations');
var mail = require('../config/mailer');

// GET users listing.
router.get('/', function (req, res, next) {
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
        validated: user.get("validated")
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

  Promise.join(tokens.getToken(24), newUserPromise, tokens.clearRelated(newUserPromise), 
  function (invite, user, clear) {
    invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

    return mail.sendInviteMail(req, user.get('email'), invite.get('token'));
  })
    .catch(User.NoRowsUpdatedError, function (err) { // User was not saved in database
      req.flash('error', 'User already exists. New user not created.');
    })
    .catch(function (err) { // Other errors
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
  Promise.join(tokens.getToken(24), userPromise, tokens.clearRelated(userPromise),
    function (invite, user, clear) {
      invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

      return mail.sendInviteMail(req, user.get('email'), invite.get('token'));
    })
    .then(function () { // Success
      req.flash('info', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
    })
    .catch(User.NotFoundError, function (err) { // Reset attempted with wrong account
      req.flash('error', 'No account with that email address exists.');
    })
    .catch(function (err) { // Other errors
      console.log(err);
      req.flash('error', 'Problem resending invite.');
    })
    .finally(function () { // All responses get redirected to /login to display flash message
      res.redirect(278, '/users'); // 278 is an unused success status code. It prevents ajax from 
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
      res.redirect(278, '/users');
    });

});

// Delete a particular user
router.delete('/:id(\\d+)', function (req, res, next) {
  var userPromise = new User({ id: req.params.id }).fetch()
  Promise.join(userPromise, tokens.clearRelated(userPromise), function (user, clear) {
      return user.destroy();
    })
    .then(function (user) {
      req.flash('yay', 'User successfully deleted');
    })
    .catch(function (err) {
      console.log(err);
      req.flash('error', 'Problem deleting user');
    })
    .finally(function () {
      res.redirect(278, '/users');
    });
});

module.exports = router;
