// Morgan skip-function logic extracted from app.js for testability (#150).
// Three rolling file streams partition request traffic:
//   access.log  — legitimate requests against known routes
//   bot.log     — probes against unknown paths or with unusual HTTP verbs
//   queries.log — search interactions on the home page (text + random)
// Each `skip()` function returns true to *exclude* the request from its log.

// Static-asset segments fetched on every page load — excluded from both
// access.log and bot.log so they don't drown out real activity. Anchored at
// the start of the path so a bot probing /foobar-favicon.php isn't masked.
var logExcludes = /^\/(fonts|stylesheets|javascripts|manifest|favicon|apple-touch-icon)/;

// Top-level routes the app actually mounts (keep in sync with app.js). The
// anchor + path-terminator suffix prevent substring false matches like
// /login.php or /users.asp passing as legitimate. aggregator.html is the
// only mounted route with an extension; listed with the dot escaped rather
// than relaxing the terminator.
var validPaths = /^\/(public|solr|tracker|private|login|logout|reset|signup|profile|refs|sources|tasks|campaigns|site|users|aggregator\.html|database)(\/|\?|$)/;

// HTTP methods the app actually serves. PROPFIND/OPTIONS/SEARCH/etc. are
// WebDAV or probe verbs — they belong in bot.log even when the path is
// otherwise valid (e.g. PROPFIND /solr/* gets a 403 from the proxy).
var appMethods = /^(GET|POST|PUT|DELETE|PATCH|HEAD)$/;

function accessLogSkip(req) {
    if (!appMethods.test(req.method)) return true;
    if (logExcludes.test(req.path)) return true;
    if (req.path !== '/' && !validPaths.test(req.path)) return true;
    if (req.path === '/' && req.method === 'POST') return true;
    return false;
}

function botLogSkip(req) {
    if (req.path === '/' && req.method === 'GET') return true;
    if (logExcludes.test(req.path)) return true;
    // Skip only when path AND method both look legitimate — those went to
    // access.log. Probe verbs against a valid path still belong here.
    if (validPaths.test(req.path) && appMethods.test(req.method)) return true;
    return false;
}

function queryLogSkip(req) {
    if (req.path !== '/') return true;
    return !('q' in req.query) && !('seed' in req.query);
}

module.exports = {
    logExcludes: logExcludes,
    validPaths: validPaths,
    appMethods: appMethods,
    accessLogSkip: accessLogSkip,
    botLogSkip: botLogSkip,
    queryLogSkip: queryLogSkip
};
