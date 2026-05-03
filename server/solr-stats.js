// Cursor-mark scan that recomputes the database.json statistics from the
// authoritative Solr index. Used by /database/recompute when an admin needs
// to fix latest/numRecords/highestId after deletes or edits that changed the
// previous "latest" reference (issue #83). Backed by solr-client (not the
// public proxy) so it isn't bound by maxRows or query whitelisting.

var solr = require('./solr-client');
var proxyOpts = require('../config/solr-proxy');

var ROWS_PER_REQUEST = 1000;

// Strict ISO 8601 (4-digit year, zero-padded month/day) at one of three
// precisions. Reduced precision is treated as the first instant of that
// span: "2020" -> 2020-01-01, "2020-02" -> 2020-02-01. Anything else
// (e.g. "+020120-01-15", "01/15/2024", "20120-01") is rejected so
// JS Date's lenient fallbacks can't push `latest` into the year 20120.
var ISO_DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function parseStrictIsoDate(s) {
    if (typeof s !== 'string') return null;
    var m = s.match(ISO_DATE_RE);
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = m[2] ? parseInt(m[2], 10) : 1;
    var d = m[3] ? parseInt(m[3], 10) : 1;
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    // Round-trip check rejects e.g. "2024-02-30" (Date silently rolls over).
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
}

async function scanCore(coreName) {
    var client = solr.createClient({
        host: proxyOpts.backend.host,
        port: proxyOpts.backend.port,
        core: coreName
    });

    var numRecords = 0;
    var highestId = 0;
    var latestDate = null;
    var latestId = null;
    var cursorMark = '*';

    while (true) {
        var query = 'q=*:*&rows=' + ROWS_PER_REQUEST +
            '&sort=id+asc&fl=id,dt' +
            '&cursorMark=' + encodeURIComponent(cursorMark);
        var obj = await client.get('select', query);
        var batch = (obj && obj.response && obj.response.docs) || [];
        for (var i = 0; i < batch.length; i++) {
            var d = batch[i];
            numRecords++;
            // id is stored as a string in Solr (default _default schema), so
            // sort=id+asc is lexicographic — we have to compute the numeric
            // max ourselves rather than reading it from the last batch.
            var idNum = parseInt(d.id, 10);
            if (!isNaN(idNum) && idNum > highestId) highestId = idNum;
            var dt = d.dt;
            if (Array.isArray(dt)) dt = dt[0];
            var dtDate = parseStrictIsoDate(dt);
            if (dtDate && (!latestDate || dtDate > latestDate)) {
                latestDate = dtDate;
                latestId = d.id;
            }
        }
        var next = obj && obj.nextCursorMark;
        if (!next || next === cursorMark) break;
        cursorMark = next;
    }

    return {
        numRecords: numRecords,
        highestId: highestId,
        latest: latestDate ? latestDate.toISOString().slice(0, 10) : null,
        latestId: latestId
    };
}

module.exports = { scanCore: scanCore };
