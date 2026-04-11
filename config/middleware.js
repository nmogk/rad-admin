// Middleware functions extracted from app.js for testability

// Route middleware to make sure a user is logged in and establishes some handlebars context elements.
function isLoggedIn(req, res, next) {
    // if user is authenticated in the session, carry on
    if (req.isAuthenticated()) {

        if(typeof req.replacements === "undefined") {
            req.replacements = {}
        }

        req.replacements.email = req.user.get("email");
        req.replacements.dispname = req.user.get("name")
        req.replacements.username = req.user.get("name") || req.user.get("email");
        req.replacements.users = req.user.get("permission") >= 2;
        req.replacements.deletable = req.user.get("permission") >= 1;
        req.replacements.nav = 1;

        return next();
    }

    // if they aren't redirect them to the login page
    res.redirect(302, '/login');
}

// Middleware which collects flash messages and packages them into the handlebars context
function flashMessageCenter(req, res, next) {
    if(typeof req.replacements === "undefined") {
        req.replacements = {}
    }

    req.replacements.errorMessage = req.flash("error");
    req.replacements.yayMessage = req.flash("yay");
    req.replacements.infoMessage = req.flash("info");

    return next();
}

// Middleware which detects if the connection is using ssl, and forces
// it if not and the user is accessing a resource other than /
var forceSsl = function (req, res, next) {
    if (req.path === '/' || req.secure) {
        return next();
    }

    var host = req.get('Host');
    var colonidx = host.indexOf(':');
    if (colonidx !== -1) {
        host = host.slice(0, colonidx);
    }

    var redirect = ['https://', host, ':', process.env.HTTPSPORT, req.url].join('')
    return res.redirect(308, redirect);
};

// Redirects to profile page if a particular user does not have
// sufficient permissions to use the user editing interface
var superuser = function (req, res, next) {
    if (req.user.get("permission") >= 2) {
        return next(); }
    res.redirect(302, '/profile');
};

module.exports = { isLoggedIn, flashMessageCenter, forceSsl, superuser };
