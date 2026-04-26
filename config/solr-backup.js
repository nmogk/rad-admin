// Cursor-mark exporter for a Solr core. Returns the entire core as a Buffer
// containing a JSON array of documents — pure function, the caller writes
// the file. Replaces the standalone tools/exportSolrIndex.py for in-process
// use; the Python script is kept for ad-hoc CLI exports.

var solr = require('./solr-client');
var proxyOpts = require('./solr-proxy');

var ROWS_PER_REQUEST = 1000;

async function exportCore(coreName) {
    var client = solr.createClient({
        host: proxyOpts.backend.host,
        port: proxyOpts.backend.port,
        core: coreName
    });

    var docs = [];
    var cursorMark = '*';

    while (true) {
        // solr-client.get does not re-encode the query string, so cursorMark
        // (which can contain '+' and '/') must be encoded by us.
        var query = 'q=*:*&rows=' + ROWS_PER_REQUEST +
            '&sort=id+asc&cursorMark=' + encodeURIComponent(cursorMark);
        var obj = await client.get('select', query);
        var batch = (obj && obj.response && obj.response.docs) || [];
        docs.push.apply(docs, batch);
        var next = obj && obj.nextCursorMark;
        if (!next || next === cursorMark) break;
        cursorMark = next;
    }

    return Buffer.from(JSON.stringify(docs), 'utf8');
}

module.exports = { exportCore: exportCore };
