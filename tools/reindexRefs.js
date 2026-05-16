// Re-posts every doc in the `rad` core back to itself so a changed field
// analyzer (or copyField) takes effect on already-indexed content. Written for
// the issue #118 follow-up that switched _text_ from text_general to
// text_html_safe — existing docs were indexed under the old analyzer and don't
// strip HTML entities until they're written again.
//
// Cursor-marks through the index in batches, drops the internal _version_
// field, bulk-POSTs each batch to the V1 /update handler, and commits once
// at the end. Stored values of text_html_safe fields keep their original
// entity-containing form, so re-posting them is enough — the new analyzer
// runs at index time on the way back in.
//
// Usage: node tools/reindexRefs.js [host] [port]
//   host defaults to localhost
//   port defaults to SOLRPORT from .env, then 8983

require('dotenv').config();
var http = require('http');

var HOST = process.argv[2] || 'localhost';
var PORT = parseInt(process.argv[3], 10) || parseInt(process.env.SOLRPORT, 10) || 8983;
var CORE = 'rad';
var BATCH = 500;

function request(method, path, body) {
    var bodyStr = body == null ? null : JSON.stringify(body);
    var headers = { 'Accept': 'application/json' };
    if (bodyStr != null) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    return new Promise(function (resolve, reject) {
        var req = http.request({
            method: method, host: HOST, port: PORT, path: path, headers: headers
        }, function (res) {
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                var raw = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error('Solr ' + res.statusCode + ': ' + raw.slice(0, 300)));
                }
                if (!raw) return resolve(null);
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        if (bodyStr != null) req.write(bodyStr);
        req.end();
    });
}

async function main() {
    console.log('Reindexing /solr/' + CORE + ' on ' + HOST + ':' + PORT);
    var cursorMark = '*';
    var total = 0;
    var batchNum = 0;

    while (true) {
        var query = 'q=*:*&rows=' + BATCH + '&sort=id+asc&fl=*' +
            '&cursorMark=' + encodeURIComponent(cursorMark);
        var res = await request('GET', '/solr/' + CORE + '/select?' + query, null);
        var docs = (res && res.response && res.response.docs) || [];
        if (docs.length === 0) break;

        // _version_ would trigger Solr's optimistic concurrency check and
        // refuse the write if anyone touched the doc between fetch and
        // re-POST. We're not trying to lock; strip it and let overwrite win.
        for (var i = 0; i < docs.length; i++) {
            delete docs[i]._version_;
        }

        await request('POST', '/solr/' + CORE + '/update', docs);
        total += docs.length;
        batchNum++;
        console.log('  Batch ' + batchNum + ': ' + total + ' docs reindexed');

        var next = res && res.nextCursorMark;
        if (!next || next === cursorMark) break;
        cursorMark = next;
    }

    console.log('Committing...');
    await request('POST', '/solr/' + CORE + '/update?commit=true', { commit: {} });
    console.log('Done. ' + total + ' docs reindexed.');
}

main().catch(function (err) {
    console.error('Reindex failed:', err.message);
    process.exit(1);
});
