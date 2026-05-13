// Minimal session-backed flash-message middleware. Drop-in replacement for the
// unmaintained `connect-flash` package, whose `var isArray = require('util').isArray`
// triggers the DEP0044 deprecation warning on modern Node.
//
// API matches the bits of connect-flash this app uses:
//   req.flash(type, msg)  -> store msg under type (returns new count)
//   req.flash(type)        -> read & clear messages of type (returns array)
//   req.flash()            -> read & clear all (returns object keyed by type)
//
// Requires session middleware to be mounted earlier in the chain so a
// per-request `req.session` is available.
module.exports = function flash() {
    return function (req, res, next) {
        if (req.flash) { return next(); }
        req.flash = _flash;
        next();
    };
};

function _flash(type, msg) {
    if (!this.session) {
        throw new Error('req.flash() requires sessions');
    }
    var msgs = this.session.flash = this.session.flash || {};
    if (type && msg) {
        msgs[type] = msgs[type] || [];
        if (Array.isArray(msg)) {
            msg.forEach(function (val) { msgs[type].push(val); });
        } else {
            msgs[type].push(msg);
        }
        return msgs[type].length;
    }
    if (type) {
        var arr = msgs[type] || [];
        delete msgs[type];
        return arr;
    }
    this.session.flash = {};
    return msgs;
}
