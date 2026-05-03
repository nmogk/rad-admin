var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var hbs = require('hbs');
var flash = require('connect-flash');
var session = require('express-session');
var KnexSessionStore = require('connect-session-knex')(session);
var { expressCspHeader, NONCE, INLINE, SELF, STRICT_DYNAMIC, EVAL, NONE} = require('express-csp-header');
var passport = require('./config/passport');
var knex = require('./config/database');
var log4js = require('./config/logger'); // Configures logger. All subsequent requires -> require('log4js')
var rollers = require('streamroller')
var accessLog = new rollers.RollingFileStream('logs/access.log', 1073741824, 5);
var botLog = new rollers.RollingFileStream('logs/bot.log', 1073741824, 5);
var queryLog = new rollers.RollingFileStream('logs/queries.log', 1073741824, 5);
var appLog = log4js.getLogger('default')

var proxyLogic = require('./config/solr-proxy');
var { createProxyMiddleware } = require('http-proxy-middleware');

const logExcludes = /fonts|stylesheets|javascripts|manifest|favicon|apple-touch-icon/
const validPaths = /public|solr|tracker|private|login|logout|reset|signup|profile|refs|sources|campaigns|site|users|aggregator/

var app = express();

// Configuration ===============================================================

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerPartials(__dirname + '/views/partials');
app.locals.appVersion = require('./package.json').version;


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

app.use(morgan(`:date[iso] :remote-addr \x1b[33m:method\x1b[0m :statusColor \x1b[36m:url\x1b[0m :response-time ms - len|:res[content-length]`)); // log every request to the console

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
        httpOnly: true,
        maxAge: 86400000 // 1 day for now
    }
})); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session


// custom middleware =============================================================
var { isLoggedIn, flashMessageCenter, forceSsl, superuser } = require('./config/middleware');


// app.use(function (req, res, next) {
//     res.setHeader('Strict-Transport-Security', 'max-age=31536000');
//     next()
// })

app.use(expressCspHeader({
    directives: {
        'default-src': [SELF], 
        'script-src': [NONCE, STRICT_DYNAMIC, EVAL, 'https:', INLINE], 
        'style-src': [SELF, INLINE, 'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/', 'https://fonts.googleapis.com/css'],
        'font-src': [SELF,'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/fonts/', 'https://fonts.gstatic.com/'],
        'img-src': [SELF, 'data:'],
        'frame-ancestors': [NONE]
    }
}));

app.use(function (request, response, next){
    hbs.registerHelper('nonce', function(opts){
        return request.nonce;
    });
    next();
})

// Serialise a value for embedding in a <script type="application/json"> tag.
// Escapes `</` so a literal `</script>` in the data can't break out.
hbs.registerHelper('json', function (value) {
    var s = JSON.stringify(value === undefined ? null : value);
    return new hbs.SafeString(s.replace(/</g, '\\u003c'));
});

// routes ======================================================================

app.use('/solr/*', proxyLogic);
app.use(express.static(path.join(__dirname, 'public')));
app.use(forceSsl);
app.use(flashMessageCenter);

// The position of these logs should not pick up requests to URLs that need to be re-queried as https or calls to the SOLR proxy
app.use(morgan(`:date[iso] :remote-addr \x1b[33m:method\x1b[0m :statusColor \x1b[36m:url\x1b[0m :response-time ms - len|:res[content-length]`, {
    skip: function(req, res){return req.path.search(logExcludes) >= 0 || (req.path !== '/' && req.path.search(validPaths) < 0) || (req.path === '/' && req.method === 'POST')},
    stream: accessLog
})); // Log legitimate requests to a file - Unlogged in attempts to read protected files should show up here
app.use(morgan(`:date[iso] :remote-addr \x1b[33m:method\x1b[0m :statusColor \x1b[36m:url\x1b[0m :response-time ms - len|:res[content-length]`, {
    skip: function(req, res){return (req.path === '/' && req.method === 'GET') || req.path.search(logExcludes) === 1 || req.path.search(validPaths) === 1},
    stream: botLog
})); // And random bot attacks to a separate file
app.use(morgan(`:date[iso] :remote-addr \x1b[33m:method\x1b[0m :statusColor \x1b[36m:url\x1b[0m :response-time ms - len|:res[content-length]`, {
    skip: function(req, res){return req.originalUrl.search(/\/\?q=/) !== 0},
    stream: queryLog
}));


// Proxy set up
app.use('/tracker', createProxyMiddleware({target:process.env.PROXY_URL, prependPath:false, changeOrigin:false, autoRewrite:true}));

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
app.use('/database',     isLoggedIn, superuser, require('./routes/database'));
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
