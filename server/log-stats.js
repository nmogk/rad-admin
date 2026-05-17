// Aggregates the morgan log streams (logs/access.log[.1..5] and
// logs/queries.log[.1..5]) into the JSON blob consumed by /stats (#111).
// All day bucketing uses UTC because morgan's `:date[iso]` is UTC; documenting
// that here so the chart's x-axis labels are interpreted consistently.

var fs = require('fs');
var path = require('path');
var readline = require('readline');
var log4js = require('log4js');
var appLog = log4js.getLogger('default');

var DAYS = 365;
var DAY_MS = 86400000;
var CACHE_TTL_MS = 5 * 60 * 1000;
var MAX_RECENT_QUERIES = 50;
var HISTOGRAM_CAP = 10;

// Morgan format (app.js:55,158): `:date[iso] :remote-addr :method :statusColor
// :url :response-time ms - len|:res[content-length]`. Method/status/URL are
// wrapped in ANSI colour escapes which we strip before matching.
var ANSI_RGX = /\x1b\[[0-9;]*m/g;
var LINE_RGX = /^(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)/;

var LOGS_DIR = path.join(__dirname, '..', 'logs');

function isoDay(ts) {
    return ts.toISOString().slice(0, 10);
}

function buildLabels(today) {
    var labels = [];
    for (var i = DAYS - 1; i >= 0; i--) {
        labels.push(isoDay(new Date(today.getTime() - i * DAY_MS)));
    }
    return labels;
}

function parseLine(rawLine) {
    if (!rawLine) return null;
    var line = rawLine.replace(ANSI_RGX, '');
    var m = LINE_RGX.exec(line);
    if (!m) return null;
    var tsMs = Date.parse(m[1]);
    if (isNaN(tsMs)) return null;
    return {
        ts: new Date(tsMs),
        tsMs: tsMs,
        ip: m[2],
        method: m[3],
        status: parseInt(m[4], 10),
        url: m[5]
    };
}

function pathOf(url) {
    var i = url.indexOf('?');
    return i === -1 ? url : url.slice(0, i);
}

function isPublicPageLoad(url) {
    var p = pathOf(url);
    return p === '/' || p === '/aggregator.html';
}

function isAggregator(url) {
    return pathOf(url) === '/aggregator.html';
}

function decodeQ(url) {
    var i = url.indexOf('q=');
    if (i === -1) return null;
    var qStart = i + 2;
    var qEnd = url.indexOf('&', qStart);
    var raw = url.slice(qStart, qEnd === -1 ? undefined : qEnd);
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch (e) {
        return raw;
    }
}

function binIndex(count) {
    if (count > HISTOGRAM_CAP) return HISTOGRAM_CAP + 1;
    return count;
}

// Read a single rotated log file line-by-line. Resolves with
// { exists, sawInRange }. Missing files resolve with exists:false; other
// errors reject. Within a file, morgan appends chronologically; whole-file
// in-range detection lets the caller stop opening still-older rotations.
async function streamOneFile(file, cutoffMs, onLine) {
    try {
        await fs.promises.access(file, fs.constants.R_OK);
    } catch (e) {
        if (e && e.code === 'ENOENT') return { exists: false, sawInRange: false };
        throw e;
    }
    return new Promise(function (resolve, reject) {
        var sawInRange = false;
        var stream = fs.createReadStream(file, { encoding: 'utf8' });
        stream.on('error', reject);
        var rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', function (rawLine) {
            var parsed = parseLine(rawLine);
            if (!parsed) {
                if (rawLine && rawLine.trim()) onLine.parseErrors++;
                return;
            }
            if (parsed.tsMs < cutoffMs) return;
            sawInRange = true;
            onLine(parsed);
        });
        rl.on('close', function () { resolve({ exists: true, sawInRange: sawInRange }); });
    });
}

// Walk logs/<base>, logs/<base>.1, ... newest→oldest. Stops when a file
// yields zero in-range lines or doesn't exist.
async function streamLog(base, cutoffMs, onLine) {
    for (var idx = 0; ; idx++) {
        var file = path.join(LOGS_DIR, idx === 0 ? base : base + '.' + idx);
        var result = await streamOneFile(file, cutoffMs, onLine);
        if (!result.exists) return;
        if (!result.sawInRange) return;
    }
}

async function compute() {
    var now = new Date();
    var labels = buildLabels(now);
    var cutoffMs = Date.parse(labels[0] + 'T00:00:00Z');

    var dayBucket = Object.create(null);
    labels.forEach(function (d) {
        dayBucket[d] = { loads: 0, queries: 0, visitorSet: new Set() };
    });

    var publicVisitors = new Set();
    var queriesPerIp = new Map();
    var aggregatorTotal = 0;
    var randomTotal = 0;
    var recentQueries = [];

    var accessLineHandler = function (entry) {
        if (entry.status >= 400) return;
        if (!isPublicPageLoad(entry.url)) return;
        var day = isoDay(entry.ts);
        var bucket = dayBucket[day];
        if (bucket) {
            bucket.loads++;
            bucket.visitorSet.add(entry.ip);
        }
        publicVisitors.add(entry.ip);
        if (isAggregator(entry.url)) aggregatorTotal++;
    };
    accessLineHandler.parseErrors = 0;

    var queryLineHandler = function (entry) {
        var day = isoDay(entry.ts);
        var bucket = dayBucket[day];
        if (bucket) bucket.queries++;
        queriesPerIp.set(entry.ip, (queriesPerIp.get(entry.ip) || 0) + 1);
        if (entry.url.indexOf('seed=') !== -1) randomTotal++;
        var q = decodeQ(entry.url);
        if (q !== null) {
            recentQueries.push({ t: entry.ts.toISOString(), q: q });
        }
    };
    queryLineHandler.parseErrors = 0;

    await streamLog('access.log', cutoffMs, accessLineHandler);
    await streamLog('queries.log', cutoffMs, queryLineHandler);

    recentQueries.sort(function (a, b) { return b.t.localeCompare(a.t); });
    recentQueries = recentQueries.slice(0, MAX_RECENT_QUERIES);

    var histogramBins = [];
    for (var b = 0; b <= HISTOGRAM_CAP; b++) histogramBins.push(String(b));
    histogramBins.push(HISTOGRAM_CAP + '+');
    var histogramCounts = new Array(histogramBins.length).fill(0);
    publicVisitors.forEach(function (ip) {
        histogramCounts[binIndex(queriesPerIp.get(ip) || 0)]++;
    });

    var pageLoads = labels.map(function (d) { return dayBucket[d].loads; });
    var uniqueVisitors = labels.map(function (d) { return dayBucket[d].visitorSet.size; });
    var queries = labels.map(function (d) { return dayBucket[d].queries; });

    var totalErrors = accessLineHandler.parseErrors + queryLineHandler.parseErrors;
    if (totalErrors > 0) {
        appLog.warn('log-stats: ' + totalErrors + ' malformed log lines skipped');
    }

    return {
        labels: labels,
        pageLoads: pageLoads,
        uniqueVisitors: uniqueVisitors,
        queries: queries,
        histogramBins: histogramBins,
        histogramCounts: histogramCounts,
        aggregatorTotal: aggregatorTotal,
        randomTotal: randomTotal,
        recentQueries: recentQueries
    };
}

var cache = { at: 0, promise: null };

function getStats() {
    if (cache.promise && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
    cache.at = Date.now();
    cache.promise = compute().catch(function (err) {
        cache.at = 0;
        cache.promise = null;
        throw err;
    });
    return cache.promise;
}

function clearCache() {
    cache.at = 0;
    cache.promise = null;
}

module.exports = {
    getStats: getStats,
    clearCache: clearCache,
    parseLine: parseLine,
    decodeQ: decodeQ,
    isPublicPageLoad: isPublicPageLoad,
    isAggregator: isAggregator
};
