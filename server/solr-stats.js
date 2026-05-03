// Cursor-mark scan that recomputes the database.json statistics from the
// authoritative Solr index. Used by /database/recompute when an admin needs
// to fix latest/numRecords/highestId after deletes or edits that changed the
// previous "latest" reference (issue #83). Backed by solr-client (not the
// public proxy) so it isn't bound by maxRows or query whitelisting.

var solr = require('./solr-client');
var proxyOpts = require('../config/solr-proxy');

var ROWS_PER_REQUEST = 1000;

async function scanCore(coreName) {
    var client = solr.createClient({
        host: proxyOpts.backend.host,
        port: proxyOpts.backend.port,
        core: coreName
    });

    var numRecords = 0;
    var highestId = 0;
    var latestDate = null;
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
            if (dt) {
                var dtDate = new Date(dt);
                if (!isNaN(dtDate.getTime()) && (!latestDate || dtDate > latestDate)) {
                    latestDate = dtDate;
                }
            }
        }
        var next = obj && obj.nextCursorMark;
        if (!next || next === cursorMark) break;
        cursorMark = next;
    }

    return {
        numRecords: numRecords,
        highestId: highestId,
        latest: latestDate ? latestDate.toISOString().slice(0, 10) : null
    };
}

module.exports = { scanCore: scanCore };
