var proxyOptions = {
    validHttpMethods: ['GET'],
    validPaths: ['/solr/rad/refs', '/solr/source/select'],
    invalidParams: ['qt', 'stream'],
    backend: {
        host: 'localhost',
        port: 8983
  }
};

module.exports = proxyOptions;