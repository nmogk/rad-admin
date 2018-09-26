var proxyOptions = {
    validHttpMethods: ['GET'],
    validPaths: ['/solr/rad/refs', '/solr/rad/refs/csv', '/solr/source/select'],
    invalidParams: ['qt', 'stream'],
    backend: {
        host: 'localhost',
        port: process.env.SOLRPORT
  }
};

module.exports = proxyOptions;