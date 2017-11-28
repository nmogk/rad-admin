var Promise = require('bluebird');
var Reset = require('../models/invitations');
var crypto = Promise.promisifyAll(require('crypto'));

var self = this;
var byteLength = 20;

// Returns a token promise
self.getToken = function (expireHours) {
    return crypto.randomBytesAsync(byteLength)
        .then(function (buf) {
            var token = buf.toString('hex');
            let date = new Date();
            date.setHours(date.getHours() + expireHours);
            return new Reset(
                {
                    token: token,
                    expires: date
                }
            )
        });
};

self.randomHexString = function () {
    return crypto.randomBytes(20).toString('hex');
}

self.clearRelated = function (userPromise) {
    return userPromise
    .then(function (user) {
        return new Reset({ user_id: user.get('id') }).fetch();
    })
    .then(function (currentToken) {
        return currentToken.destroy(); // Remove the expired token
    })
    .catch(function (err) { }); // No token found. All is well
};

module.exports = self;