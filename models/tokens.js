var crypto = require('crypto');
var { promisify } = require('util');
var Invitation = require('./invitations');

var randomBytesAsync = promisify(crypto.randomBytes);
var byteLength = 20;

// Returns a plain { token, expires } payload. Callers spread it, add user_id,
// then Invitation.query().insertAndFetch(...) to persist.
exports.getToken = async function (expireHours) {
    var buf = await randomBytesAsync(byteLength);
    var token = buf.toString('hex');
    var expires = new Date();
    expires.setHours(expires.getHours() + expireHours);
    return { token: token, expires: expires };
};

exports.randomHexString = function () {
    return crypto.randomBytes(byteLength).toString('hex');
};

exports.clearRelated = async function (userPromise) {
    try {
        var user = await userPromise;
        await Invitation.query().delete().where({ user_id: user.id });
    } catch (err) { /* nothing to clear */ }
};
