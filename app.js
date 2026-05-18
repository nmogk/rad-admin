var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var compression = require('compression');
var cookieParser = require('cookie-parser');
var hbs = require('hbs');
var flash = require('./server/flash');
var session = require('express-session');
var { ConnectSessionKnexStore } = require('connect-session-knex');
var { createProxyServer } = require('httpxy');
var { expressCspHeader, NONCE, INLINE, SELF, STRICT_DYNAMIC, EVAL, NONE} = require('express-csp-header');
var { doubleCsrf } = require('csrf-csrf');
var passport = require('./config/passport');
var knex = require('./config/database');
var log4js = require('./config/logger'); // Configures logger. All subsequent requires -> require('log4js')
var rollers = require('streamroller')
var accessLog = new rollers.RollingFileStream('logs/access.log', 1073741824, 5);
var botLog = new rollers.RollingFileStream('logs/bot.log', 1073741824, 5);
var queryLog = new rollers.RollingFileStream('logs/queries.log', 1073741824, 5);
var appLog = log4js.getLogger('default')

var proxyLogic = require('./config/solr-proxy');

var logFilters = require('./server/log-filters');

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

// Gzip/deflate text responses. Mounted before static + the Solr proxy so
// HTML, JS, CSS, and proxied JSON all flow through it; compression skips
// responses that already have a Content-Encoding header so a gzipped
// Solr response isn't re-encoded.
app.use(compression());

// Mount the Solr proxy and public static files ahead of the session/auth
// stack: neither needs cookies, sessions, Passport, or flash, and parking
// them here keeps every public read from paying a MySQL session lookup +
// Passport deserialization round-trip.
app.use('/solr/*', proxyLogic);
// maxAge sets the Cache-Control: max-age on static assets so repeat
// visitors don't refetch them. ETag/Last-Modified are on by default, so
// even when the TTL expires we get cheap 304s. 1d is a conservative
// floor (no hashed filenames yet); a deploy that changes a file may
// take up to a day to propagate.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIESECRET)); // read cookies (needed for auth + CSRF)

// Session setup required for passport
var store = new ConnectSessionKnexStore({
    knex: knex,
    createTable: true
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

// CSRF protection (double-submit cookie via csrf-csrf). The middleware is
// installed below the proxies/static handlers so /solr/* (GET-only) and the
// /tracker reverse proxy don't go through validation. Token generation is
// stateless: a signed cookie is paired with a token echoed back via either
// the x-csrf-token header (AJAX) or a hidden _csrf form input.
// Fail fast: without CSRFSECRET, the HMAC step crashes per-request with a
// cryptic "key argument must be of type string" error, surfaced as a 500 on
// every page including static assets. Better to refuse to boot.
if (!process.env.CSRFSECRET) {
    appLog.fatal('CSRFSECRET environment variable is required. Set it in .env to a random ~64-char string.');
    throw new Error('CSRFSECRET environment variable is not set.');
}
var { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: function () { return process.env.CSRFSECRET; },
    getSessionIdentifier: function (req) { return req.sessionID || req.ip; },
    cookieName: '__Host-x-csrf-token',
    cookieOptions: { sameSite: 'strict', secure: true, httpOnly: true, path: '/' },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: function (req) {
        return req.headers['x-csrf-token'] || (req.body && req.body._csrf);
    }
});


// custom middleware =============================================================
var { isLoggedIn, flashMessageCenter, forceSsl, superuser } = require('./server/middleware');


// app.use(function (req, res, next) {
//     res.setHeader('Strict-Transport-Security', 'max-age=31536000');
//     next()
// })

app.use(expressCspHeader({
    directives: {
        'default-src': [SELF], 
        'script-src': [NONCE, STRICT_DYNAMIC, EVAL, 'https:', INLINE], 
        'style-src': [SELF, INLINE, 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/', 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/', 'https://bootswatch.com/5/journal/', 'https://fonts.googleapis.com/'],
        'font-src': [SELF, 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/', 'https://fonts.gstatic.com/'],
        'img-src': [SELF, 'data:'],
        'frame-ancestors': [NONE]
    }
}));

// Helpers are registered once at startup. The previous implementation
// re-registered `nonce` and `csrf` inside a per-request middleware, which
// mutated the global hbs singleton on every request — under concurrency
// that lets one request's token end up in another request's HTML. Now the
// helpers read per-request state from the render context: Express merges
// res.locals into the template's root data, so `options.data.root.nonce`
// / `.csrfToken` resolve to whatever the request middleware below set.
hbs.registerHelper('nonce', function (options) {
    return options.data.root.nonce || '';
});
hbs.registerHelper('csrf', function (options) {
    var token = options.data.root.csrfToken || '';
    return new hbs.SafeString('<input type="hidden" name="_csrf" value="' + token + '">');
});
// Serialise a value for embedding in a <script type="application/json"> tag.
// Escapes `</` so a literal `</script>` in the data can't break out.
hbs.registerHelper('json', function (value) {
    var s = JSON.stringify(value === undefined ? null : value);
    return new hbs.SafeString(s.replace(/</g, '\\u003c'));
});

// Per-request: surface the CSP nonce and a CSRF token via res.locals so the
// helpers above (and templates that reference {{csrfToken}} directly) can
// pick them up. generateCsrfToken reuses the cookie when one exists, so the
// HMAC cost is bounded.
app.use(function (request, response, next) {
    response.locals.nonce = request.nonce;
    response.locals.csrfToken = generateCsrfToken(request, response);
    next();
});

// routes ======================================================================

app.use(forceSsl);
app.use(flashMessageCenter);

// File-bound request logs. Mounted below forceSsl + the /solr/* proxy so
// HTTPS redirects and Solr proxy traffic don't end up in these files (the
// console Morgan above still catches them). A single middleware formats
// the line once and fans it out to whichever rolling streams accept it,
// replacing three separate Morgan instances that each ran the same format
// pipeline independently.
var fileLogStreams = [
    { stream: accessLog, skip: logFilters.accessLogSkip }, // legitimate requests against known routes
    { stream: botLog,    skip: logFilters.botLogSkip },    // probes against unknown paths / unusual verbs
    { stream: queryLog,  skip: logFilters.queryLogSkip }   // home-page search interactions
];

app.use(function fileRequestLogger(req, res, next) {
    var startNs = process.hrtime.bigint();
    var emitted = false;
    function emit() {
        if (emitted) return;
        emitted = true;
        var destinations = [];
        for (var i = 0; i < fileLogStreams.length; i++) {
            if (!fileLogStreams[i].skip(req)) destinations.push(fileLogStreams[i].stream);
        }
        if (destinations.length === 0) return;

        var elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        var status = res.statusCode;
        var color = status >= 500 ? 31 : status >= 400 ? 33 : status >= 300 ? 36 : status >= 200 ? 32 : 0;
        var len = res.getHeader('content-length');
        var line = new Date().toISOString()
            + ' ' + (req.ip || '-')
            + ' \x1b[33m' + req.method + '\x1b[0m'
            + ' \x1b[' + color + 'm' + status + '\x1b[0m'
            + ' \x1b[36m' + (req.originalUrl || req.url) + '\x1b[0m'
            + ' ' + elapsedMs.toFixed(3) + ' ms - len|' + (len == null ? '-' : len)
            + '\n';
        for (var j = 0; j < destinations.length; j++) destinations[j].write(line);
    }
    res.on('finish', emit);
    res.on('close', emit);
    next();
});


// Proxy set up
if (process.env.PROXY_URL) {
    var trackerProxy = createProxyServer({target: process.env.PROXY_URL, prependPath: false, changeOrigin: false, autoRewrite: true});
    app.use('/tracker', function (req, res) { trackerProxy.web(req, res); });
}

// Private directory is for scripts that will only be transferred if the user is logged in.
app.all('/private/*', isLoggedIn); // This must come before the next line
app.use('/private', express.static(path.join(__dirname, 'private'), { maxAge: '1d' }));

// Mount CSRF validation just before route handlers so the Solr proxy
// (GET-only) and the /tracker reverse proxy above are not subject to it.
// GET/HEAD/OPTIONS are skipped via ignoredMethods.
app.use(doubleCsrfProtection);

app.use('/', require('./routes/index'));
app.use('/login', require('./routes/login'));
app.use('/logout', require('./routes/logout'));
app.use('/reset', require('./routes/reset'));
app.use('/signup', require('./routes/reset'));

app.use('/profile', isLoggedIn, require('./routes/profile'));
app.use('/refs', isLoggedIn, require('./routes/refs'));
app.use('/sources',   isLoggedIn, require('./routes/sources'));
app.use('/tasks',     isLoggedIn, require('./routes/tasks'));
app.use('/campaigns', isLoggedIn, require('./routes/campaigns'));
app.use('/site',      isLoggedIn, require('./routes/site'));
app.use('/stats',     isLoggedIn, require('./routes/stats'));
app.use('/database',     isLoggedIn, superuser, require('./routes/database'));
app.use('/users',        isLoggedIn, superuser, require('./routes/users'));
app.use('/users/signup', isLoggedIn, superuser, require('./routes/signup'));

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// CSRF rejection handler — return 403 JSON for AJAX clients, HTML otherwise.
// Placed before the generic error handler so the user sees a clear error
// instead of a stack trace.
app.use(function (err, req, res, next) {
    if (err && err.code === 'EBADCSRFTOKEN') {
        res.status(403);
        if (req.accepts('json') === 'json' || req.is('application/json')) {
            return res.json({ error: 'Invalid CSRF token' });
        }
        return res.send('Invalid CSRF token');
    }
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
