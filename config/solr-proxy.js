var http = require('http');
var proxy = require('httpxy');
var log4js = require('log4js');
var appLog = log4js.getLogger('default');

var proxyOptions = {
    validHttpMethods: ['GET'],
    validPaths: ['/solr/rad/refs', '/solr/rad/refs/csv', '/solr/source/select'],
    invalidParams: ['qt', 'stream'],
    maxRows: 1000,
    // Paths whose `boost` query param the proxy rewrites (#160). Other
    // proxied paths (source autocomplete) pass through untouched.
    boostPaths: ['/solr/rad/refs', '/solr/rad/refs/csv'],
    // Year offset added to the current year inside recip(sub(YEAR, year),…).
    // Matches the legacy hard-coded constant 2029 against a 2026 base, so
    // results when boost is on are identical to the old config.
    boostYearMargin: 3,
    backend: {
        host: 'localhost',
        port: process.env.SOLRPORT
  }
};

// Dedicated keep-alive agent for the Node↔Solr hop. httpxy's defaults
// already enable keep-alive on its shared agent, but it also forwards the
// incoming `Connection` header verbatim — so a browser sending
// `Connection: close` (e.g. on page unload) makes Solr tear down the
// socket we'd otherwise return to the pool. Override the outgoing
// Connection header below to detach the upstream socket lifecycle from
// whatever the browser sent.
var solrAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 256,
    maxFreeSockets: 64
});

var proxyServer = proxy.createProxyServer({
    target: proxyOptions.backend,
    agent: solrAgent,
    headers: { connection: 'keep-alive' }
});

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

// Returns the highest numeric value from the parsed `rows` query parameter
// (string for `?rows=10`, array for `?rows=10&rows=20`), or 0 if missing or
// all values are non-numeric. Used to enforce the page-size cap so a public
// caller can't request an arbitrarily large page (issue #16). Silent
// clamping was rejected because Solr clients compute pagination from the
// request's `rows`, which would diverge from what was actually returned.
var maxRequestedRows = function (rowsParam) {
  if (rowsParam === undefined || rowsParam === null) return 0;
  var values = Array.isArray(rowsParam) ? rowsParam : [rowsParam];
  return values.reduce(function (max, v) {
      var n = parseInt(v, 10);
      return !isNaN(n) && n > max ? n : max;
  }, 0);
};

// Rewrites the `boost` query param on rad refs requests so the boost
// function is constructed server-side instead of relying on a hard-coded
// recip(sub(YEAR, year),…) default baked into the Solr request handler
// (#160). The public URL stays simple — `?boost=1` means "user wants the
// date boost on", absence means "off". The proxy translates:
//   boost=1     -> recip(sub(<currentYear+margin>, year),0.3,1,1)
//   anything else / absent -> 1 (constant, overrides the Solr-side default)
// Paths outside boostPaths (e.g. /solr/source/select) pass through
// untouched so source autocomplete isn't disturbed. We always send an
// explicit boost on the refs paths, which means the Solr-side default
// is dead code — that's intentional; removing it would require a Config
// API delta against the live core.
var rewriteBoost = function (originalUrl, baseUrl, options) {
    options = options || proxyOptions;
    if (options.boostPaths.indexOf(baseUrl) === -1) return originalUrl;
    var qIdx = originalUrl.indexOf('?');
    var path = qIdx === -1 ? originalUrl : originalUrl.slice(0, qIdx);
    var params = new URLSearchParams(qIdx === -1 ? '' : originalUrl.slice(qIdx + 1));
    var requested = params.get('boost'); // first value wins if repeated
    params.delete('boost');
    if (requested === '1') {
        var year = new Date().getFullYear() + options.boostYearMargin;
        params.append('boost', 'recip(sub(' + year + ',year),0.3,1,1)');
    } else {
        params.append('boost', '1');
    }
    return path + '?' + params.toString();
};

var proxyLogic = function (request, response){

  if (!validateRequest(request, proxyOptions)) {
      appLog.info(`Illegal Solr request received: ${request.originalUrl}`)
      response.writeHead(403, 'Illegal request');
      response.write('solrProxy: access denied\n');
      response.end();
      return;
  }

  if (maxRequestedRows(request.query.rows) > proxyOptions.maxRows) {
      appLog.info(`Solr request exceeds rows limit: ${request.originalUrl}`)
      response.writeHead(400, 'Bad Request');
      response.write(`solrProxy: rows parameter exceeds limit (${proxyOptions.maxRows})\n`);
      response.end();
      return;
  }

  request.url = rewriteBoost(request.originalUrl, request.baseUrl);
  proxyServer.web(request, response);
};

proxyLogic.backend = proxyOptions.backend;
proxyLogic.validateRequest = validateRequest;
proxyLogic.maxRequestedRows = maxRequestedRows;
proxyLogic.rewriteBoost = rewriteBoost;
proxyLogic.proxyOptions = proxyOptions;

module.exports = proxyLogic;