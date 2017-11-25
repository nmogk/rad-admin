var express = require('express');
var router = express.Router();
var User = require('../models/user');
var Promise = require('bluebird');
var _ = require('lodash');
var crypto = Promise.promisifyAll(require('crypto'));

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

  newUserPass = crypto.randomBytes(20).toString('hex');

  // If the superuser is refreshing an invitation, the save command should trigger an update
  // with the new password. This will essentially be a forced administrative password reset.
  // If invitation resends don't work, this call is likely to blame.
  newUserPromise = new User({ email: req.body.newUserEmail, password: newUserPass }).save();

  // Generate the random token to use for the invitation token
  var tokenPromise = crypto.randomBytesAsync(20)
    .then(function (buf) {
      var token = buf.toString('hex');
      let date = new Date();
      date.setDate(date.getDate() + 1); // Invitations expire 1 day after issue
      return new Reset(
        {
          token: token,
          expires: date
        }
      )
    });

  var clearPromise = newUserPromise
    .then(function (user) {
      return new Reset({ user_id: user.get('id') }).fetch();
    })
    .then(function (currentToken) {
      return currentToken.destroy(); // Remove the expired token
    })
    .catch(function (err) { }); // No token found. All is well

  Promise.join(tokenPromise, newUserPromise, clearPromise, function (invite, user, clear) {
    invite.set('user_id', user.id).save(null, { method: 'insert' }); // Link the token to account, then save in database

    return mail.sendInviteMail(req, user.get('email'), invite.get('token'));
  })
    .catch(User.NoRowsUpdatedError, function (err) { // User was not saved in database
      req.flash('userMessage', 'New user not created.');
      res.redirect('/users');
    })
    .catch(function (err) {

    });

});

// Updating permissions for user 
router.post('/:id/:level', function (req, res, next) {
  if (level < 0 || level > 2) {
    req.flash('userMessage', 'Invalid permission level');
    res.redirect(400, '/users');
    return;
  }

  new User({ id: id }).fetch({ require: true })
    .then(function (user) {
      return user
        .set('permission', level)
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
  new User({ id: id }).fetch({ require: true })
    .then(function (user) {
      return user.destroy();
    })
    .then(function (user) {
      return req.flash('userMessage', 'User successfully deleted');
    })
    .catch(function (err) {
      return req.flash('userMessage', 'Problem deleting user');
    })
    .finally(function () {
      res.redirect(303, '/users');
    });
});

module.exports = router;
