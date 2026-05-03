var proxy = require('http-proxy');
var log4js = require('log4js');
var appLog = log4js.getLogger('default');

var proxyOptions = {
    validHttpMethods: ['GET'],
    validPaths: ['/solr/rad/refs', '/solr/rad/refs/csv', '/solr/source/select'],
    invalidParams: ['qt', 'stream'],
    maxRows: 1000,
    backend: {
        host: 'localhost',
        port: process.env.SOLRPORT
  }
};

var proxyServer = proxy.createProxyServer({target: proxyOptions.backend});

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

// Clamps the Solr `rows` param so a public caller can't request an arbitrarily
// large page. The admin UI input cap doesn't bind URL/REST callers (issue #16).
var clampRows = function (originalUrl, maxRows) {
  var u = new URL(originalUrl, 'http://placeholder');
  var maxRequested = u.searchParams.getAll('rows').reduce(function (max, v) {
      var n = parseInt(v, 10);
      return !isNaN(n) && n > max ? n : max;
  }, 0);
  if (maxRequested > maxRows) {
      u.searchParams.set('rows', String(maxRows));
      return u.pathname + u.search;
  }
  return originalUrl;
};

var proxyLogic = function (request, response){

  if (validateRequest(request, proxyOptions)) {
      request.url = clampRows(request.originalUrl, proxyOptions.maxRows);
      proxyServer.web(request, response);
  } else {
      appLog.info(`Illegal Solr request received: ${request.originalUrl}`)
      response.writeHead(403, 'Illegal request');
      response.write('solrProxy: access denied\n');
      response.end();
  }
};

proxyLogic.backend = proxyOptions.backend;
proxyLogic.validateRequest = validateRequest;
proxyLogic.clampRows = clampRows;
proxyLogic.proxyOptions = proxyOptions;

module.exports = proxyLogic;