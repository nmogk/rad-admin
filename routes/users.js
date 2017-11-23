var express = require('express');
var router = express.Router();
var User = require('../models/user');
var Promise = require('bluebird');
var _ = require('lodash');

// GET users listing.
router.get('/', function (req, res, next) {

  res.send('respond with a resource');
});

// RESTful endpoint for getting an array of users in json format 
router.get('/all', function (req, res, next) {
  usersJson = [];

  usersPromise = User.fetchAll();

  usersPromise.then((users) => console.log(users));
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
  .then(function (){
    res.jsonp(usersJson);
  })

});

// 
router.post('/invite', function (req, res, next) {

});

// Updating permissions for user 
router.post('/:id', function (req, res, next) {

});

// Delete a particular user
router.delete('/:id', function (req, res, next) {

});

module.exports = router;
