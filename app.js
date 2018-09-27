var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var hbs = require('hbs');
var flash = require('connect-flash');
var session = require('express-session');
var KnexSessionStore = require('connect-session-knex')(session);

var passport = require('./config/passport');
var bookshelf = require('./config/bookshelf');
var knex = require('./config/database');
var log4js = require('./config/logger'); // Configures logger. All subsequent requires -> require('log4js')

var proxy = require('http-proxy');
var proxyOpts = require('./config/solr-proxy');

var app = express();

// Configuration ===============================================================

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerPartials(__dirname + '/views/partials');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev')); // log every request to the console
app.use(bodyParser.json()); // get information from html forms
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // read cookies (needed for auth)

// Session setup required for passport
var store = new KnexSessionStore({
    knex: knex,
    createtable: true
});

app.use(session({
    secret: process.env.SESSIONKEY,
    store: store,
    saveUninitialized: false,
    resave: false,
    unset: 'destroy',
    cookie: {
        secure: true,
        maxAge: 86400000 // 1 day for now
    }
})); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

// Proxy set up

var proxyServer = proxy.createProxyServer({target: proxyOpts.backend});


// custom middleware =============================================================

// route middleware to make sure a user is logged in and establishes some handlebars context elements.
function isLoggedIn(req, res, next) {

    // if user is authenticated in the session, carry on 
    if (req.isAuthenticated()) {
        if(typeof req.replacements === "undefined") {
            req.replacements = {}
        }

        req.replacements.email = user.get("email");
        req.replacements.dispname = user.get("name")
        req.replacements.username = user.get("name") || user.get("email");
        req.replacements.users = user.get("permission") >= 2;
        req.replacements.deletable = req.user.get("permission") >= 1;
        req.replacements.nav = 1;
        
        return next();
    }

    // if they aren't redirect them to the login page
    res.redirect('/login');
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
    if (req.path === '/' || req.connection.encrypted) {
        return next();
    }

    var host = req.get('Host');
    var colonidx = host.indexOf(':');
    if (colonidx !== -1) {
        host = host.slice(0, colonidx);
    }

    var redirect = ['https://', host, ':', process.env.HTTPSPORT, req.url].join('')
    return res.redirect(redirect);
};

// Redirects to profile page if a particular user does not have
// Sufficient permissions to use the user editing interface
var superuser = function (req, res, next) {
    if (req.user.get("permission") >= 2) { 
        return next(); }
    res.redirect('/profile');
};


/*
 * Returns true if the request satisfies the following conditions:
 *  - HTTP method (e.g., GET) is in options.validHttpMethods
 *  - Path (eg. /solr/update) is in options.validPaths
 *  - All request query params (eg ?q=, ?stream.url=) not in options.invalidParams
 */
var validateRequest = function(request, options) {
    return options.validHttpMethods.indexOf(request.method) !== -1 &&
        options.validPaths.indexOf(request.baseUrl) !== -1 &&
        Object.keys(request.query).every(function(p) {
        var paramPrefix = p.split('.')[0]; // invalidate not just "stream", but "stream.*"
        return options.invalidParams.indexOf(paramPrefix) === -1;
        });
};

var proxyLogic = function (request, response){
    if (validateRequest(request, proxyOpts)) {
        request.url = request.originalUrl;
        proxyServer.web(request, response);
    } else {
        response.writeHead(403, 'Illegal request');
        response.write('solrProxy: access denied\n');
        response.end();
    }
};

// routes ======================================================================

app.use('/solr/*', proxyLogic);
app.use(express.static(path.join(__dirname, 'public')));
app.use(forceSsl);

// Private directory is for scripts that will only be transferred if the user is logged in.
app.all('/private/*', isLoggedIn); // This must come before the next line
app.use('/private', express.static(path.join(__dirname, 'private')));


app.use('/', require('./routes/index'));
app.use('/login', require('./routes/login'));
app.use('/logout', require('./routes/logout'));
app.use('/reset', require('./routes/reset'));
app.use('/signup', require('./routes/reset'));

app.use('/profile', isLoggedIn, require('./routes/profile'));
app.use('/refs', isLoggedIn, require('./routes/refs'));
app.use('/sources',   isLoggedIn, require('./routes/sources'));
app.use('/campaigns', isLoggedIn, require('./routes/campaigns'));
app.use('/site',      isLoggedIn, require('./routes/site'));
app.use('/users',        isLoggedIn, superuser, require('./routes/users'));
app.use('/users/signup', isLoggedIn, superuser, require('./routes/signup'));

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
