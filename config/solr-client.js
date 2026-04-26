// In-repo Solr client. Replaces the defunct `solr-client` npm package (issue #104).
// One client instance per Solr core. All methods return Promises.
// Database.json updates live in `./database-json.js`.
//
// Uses the V1 path `/solr/<core>` because Solr 9's V2 endpoint
// `/api/cores/<core>/update` routes to the JSON-docs ingester, which treats
// the whole body as one document and ignores the `add`/`delete` command
// wrappers we send. V1's `/update` handler parses those commands correctly.

var http = require('http');
var log4js = require('log4js');
var log = log4js.getLogger('solr-client');

function truncate(s, n) {
    if (!s) return '';
    s = String(s);
    return s.length > n ? s.slice(0, n) + '…(+' + (s.length - n) + ')' : s;
}

function createClient(opts) {
    var host = opts.host;
    var port = opts.port;
    var core = opts.core;
    var basePath = '/solr/' + core;

    function request(method, path, body) {
        var bodyStr = body == null ? null : JSON.stringify(body);
        var url = 'http://' + host + ':' + port + path;
        var headers = { 'Accept': 'application/json' };
        if (bodyStr != null) {
            headers['Content-Type'] = 'application/json; charset=utf-8';
            headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        log.debug('%s %s%s', method, url, bodyStr ? ' body=' + truncate(bodyStr, 500) : '');
        var start = Date.now();

        return new Promise(function (resolve, reject) {
            var req = http.request({
                method: method,
                host: host,
                port: port,
                path: path,
                headers: headers
            }, function (res) {
                var chunks = [];
                res.on('data', function (c) { chunks.push(c); });
                res.on('end', function () {
                    var raw = Buffer.concat(chunks).toString('utf8');
                    var ms = Date.now() - start;
                    log.debug('%s %s -> %d (%dms) %s', method, url, res.statusCode, ms, truncate(raw, 500));

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        log.warn('Solr %s %s returned %d: %s', method, url, res.statusCode, truncate(raw, 200));
                        var err = new Error('Solr ' + res.statusCode + ': ' + truncate(raw, 200));
                        err.status = res.statusCode;
                        err.body = raw;
                        return reject(err);
                    }

                    if (!raw) return resolve(null);
                    try {
                        resolve(JSON.parse(raw));
                    } catch (e) {
                        log.warn('Solr %s %s returned invalid JSON: %s', method, url, truncate(raw, 200));
                        reject(e);
                    }
                });
            });
            req.on('error', function (err) {
                log.warn('Solr %s %s failed: %s', method, url, err.message);
                reject(err);
            });
            if (bodyStr != null) req.write(bodyStr);
            req.end();
        });
    }

    function get(route, query) {
        var path = basePath + '/' + route + (query ? '?' + query : '');
        return request('GET', path, null);
    }

    function add(doc) {
        return request('POST', basePath + '/update?commit=true', { add: { doc: doc, overwrite: true } });
    }

    function deleteByID(id) {
        var idStr = String(id);
        var selectPath = basePath + '/select?q=id:' + encodeURIComponent(idStr) + '&rows=1';
        return request('GET', selectPath, null).then(function (obj) {
            var doc = obj && obj.response && obj.response.docs && obj.response.docs[0];
            return request('POST', basePath + '/update?commit=true', { delete: { id: idStr } })
                .then(function () { return doc; });
        });
    }

    return { get: get, add: add, deleteByID: deleteByID };
}

module.exports = { createClient: createClient };
