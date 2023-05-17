var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var hbs = require('hbs');
var flash = require('connect-flash');
var session = require('express-session');
var KnexSessionStore = require('connect-session-knex')(session);

var passport = require('./config/passport');
var knex = require('./config/database');
var log4js = require('./config/logger'); // Configures logger. All subsequent requires -> require('log4js')
var rollers = require('streamroller')
var accessLog = new rollers.RollingFileStream('logs/access.log', 1073741824, 5);
var appLog = log4js.getLogger('default')

var proxyLogic = require('./config/solr-proxy');
var { createProxyMiddleware } = require('http-proxy-middleware');

var app = express();

// Configuration ===============================================================

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerPartials(__dirname + '/views/partials');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

morgan.token('statusColor', (req, res, args) => {
    // get the status code if response written
    var status = (typeof res.headersSent !== 'boolean' ? Boolean(res.header) : res.headersSent)
        ? res.statusCode
        : undefined

    // get status color
    var color = status >= 500 ? 31 // red
        : status >= 400 ? 33 // yellow
            : status >= 300 ? 36 // cyan
                : status >= 200 ? 32 // green
                    : 0; // no color

    return '\x1b[' + color + 'm' + status + '\x1b[0m';
});

app.use(morgan(`:date[iso] :remote-addr \x1b[33m:method\x1b[0m :statusColor\x1b[36m:url\x1b[0m :response-time ms - length|:res[content-length]`, {
    skip: function(req, res){return req.path.search(/stylesheets|javascripts|manifest/) >= 0}
})); // log every request to the console
app.use(morgan(`:date[iso] :remote-addr \x1b[33m:method\x1b[0m :statusColor\x1b[36m:url\x1b[0m :response-time ms - length|:res[content-length]`, {
    skip: function(req, res){return req.path.search(/stylesheets|javascripts|manifest/) >= 0},
    stream: accessLog
})); // And to a file
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
app.use('/tracker', createProxyMiddleware({target:process.env.PROXY_URL, prependPath:false, changeOrigin:false, autoRewrite:true}));
app.use('/tracker', express.static(process.env.PROXY_DOCROOT));

// custom middleware =============================================================

// route middleware to make sure a user is logged in and establishes some handlebars context elements.
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




// routes ======================================================================

app.use('/solr/*', proxyLogic);
app.use(express.static(path.join(__dirname, 'public')));
app.use(forceSsl);
app.use(flashMessageCenter);

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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown(){
    appLog.info("Received shutdown signal.");
    log4js.shutdown();
    console.log("Goodbye");
    process.exit();
}

appLog.info('Startup complete.')

module.exports = app;
