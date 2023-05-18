var proxy = require('http-proxy');

var proxyOptions = {
    validHttpMethods: ['GET'],
    validPaths: ['/solr/rad/refs', '/solr/rad/refs/csv', '/solr/source/select'],
    invalidParams: ['qt', 'stream'],
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

var proxyLogic = function (request, response){

  if (validateRequest(request, proxyOptions)) {
      request.url = request.originalUrl;
      proxyServer.web(request, response);
  } else {
      appLog.info(`Illegal Solr request received: ${request.originalUrl}`)
      response.writeHead(403, 'Illegal request');
      response.write('solrProxy: access denied\n');
      response.end();
  }
};

proxyLogic.backend = proxyOptions.backend;

module.exports = proxyLogic;