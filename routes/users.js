var express = require('express');
var router = express.Router();
var User = require('../models/user');
var Promise = require('bluebird');
var _ = require('lodash');
var tokens = require('../models/tokens');
var Invite = require('../models/invitations');

function getReplacements(req) {
  var replacements = {};
  let user = req.user;
  replacements.username = user.get("name") || user.get("email");
  replacements.users = user.get("permission") >= 2;
  replacements.message = req.flash("userMessage");
  replacements.nav = 1;
  return replacements;
}


// GET users listing.
router.get('/', function (req, res, next) {
  console.log(getReplacements(req));
  res.render('users', getReplacements(req));
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
  if (!req.body.newUserEmail) {
    req.flash('userMessage', 'No email specified');
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
      req.flash('userMessage', 'User already exists. New user not created.');
    })
    .catch(function (err) { // Other errors
      console.log(err);
      req.flash('userMessage', 'Problem resending invite.');
    })
    .finally(function () { // All responses get redirected to /login to display flash message
      res.redirect(303, '/users'); // 303 ensures that the client uses GET rather than POST.
    });

});

// Allows the superuser to refresh an invitation, the save command should trigger an update
// with the new password. This will essentially be a forced administrative password reset.
router.post('resend/:id', function (req, res, next) {
  // Fetch the user from the given email. This will happen only once, and this promise will be reused
  // If the user is not found, then it will throw a User.NotFoundError which is caught below.
  var userPromise = new User({ id: req.params.id }).fetch({ require: true })

  // Wait for all the ingredients to return before using them
  Promise.join(tokens.getToken(24), userPromise, tokens.clearRelated(userPromise),
    function (invite, user, clear) {
      invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

      return mail.sendInviteMail(req, user.get('email'), invite.get('token'));
    })
    .then(function () { // Success
      return req.flash('userMessage', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
    })
    .catch(User.NotFoundError, function (err) { // Reset attempted with wrong account
      return req.flash('userMessage', 'No account with that email address exists.');
    })
    .catch(function (err) { // Other errors
      console.log(err);
      req.flash('userMessage', 'Problem resending invite.');
    })
    .finally(function () { // All responses get redirected to /login to display flash message
      res.redirect(303, '/users'); // 303 ensures that the client uses GET rather than POST.
    });
});

// Updating permissions for user 
router.post('/:id/:level', function (req, res, next) {
  if (req.params.level < 0 || req.params.level > 2) {
    req.flash('userMessage', 'Invalid permission level');
    res.redirect(400, '/users');
    return;
  }

  new User({ id: req.params.id }).fetch({ require: true })
    .then(function (user) {
      return user
        .set('permission', req.params.level)
        .save();
    })
    .then(function (user) {
      return req.flash('userMessage', 'User permissions successfully updated');
    })
    .catch(function (err) {
      return req.flash('userMessage', 'Problem updating user');
    })
    .finally(function () {
      res.redirect(303, '/users');
    });

});

// Delete a particular user
router.delete('/:id', function (req, res, next) {
  new User({ id: req.params.id }).fetch({ require: true })
    .then(function (user) {
      return user.destroy();
    })
    .then(function (user) {
      return req.flash('userMessage', 'User successfully deleted');
    })
    .catch(function (err) {
      console.log(err);
      return req.flash('userMessage', 'Problem deleting user');
    })
    .finally(function () {
      res.redirect(303, '/users');
    });
});

module.exports = router;
