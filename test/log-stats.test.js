var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var stream = require('stream');
var path = require('path');

var log4jsStub = {
    getLogger: sinon.stub().returns({
        info: sinon.stub(),
        warn: sinon.stub(),
        debug: sinon.stub()
    })
};

// Map of filename suffix -> 'lines' string OR 'ENOENT'. Tests override
// before requiring/clearing the module.
var fakeFiles = {};

function readableFor(content) {
    return stream.Readable.from([content], { encoding: 'utf8' });
}

function isMissing(base) {
    return typeof fakeFiles[base] === 'undefined' || fakeFiles[base] === 'ENOENT';
}

var fsStub = {
    createReadStream: function (file) {
        // Match by basename so absolute path from log-stats lines up with
        // test fixtures keyed on 'access.log', 'access.log.1', etc.
        var base = path.basename(file);
        return readableFor(fakeFiles[base] || '');
    },
    promises: {
        access: function (file) {
            var base = path.basename(file);
            if (isMissing(base)) {
                var err = new Error('ENOENT: no such file ' + base);
                err.code = 'ENOENT';
                return Promise.reject(err);
            }
            return Promise.resolve();
        }
    },
    constants: { R_OK: 4 }
};

var logStats = proxyquire('../server/log-stats', {
    'log4js': log4jsStub,
    'fs': fsStub
});

// Build a morgan-format log line (with ANSI escapes around method/status/URL,
// matching app.js:55) so tests exercise the same parsing the real log uses.
function morganLine(ts, ip, method, status, url) {
    return ts + ' ' + ip +
        ' \x1b[33m' + method + '\x1b[0m' +
        ' \x1b[32m' + status + '\x1b[0m' +
        ' \x1b[36m' + url + '\x1b[0m' +
        ' 12.345 ms - len|4521';
}

function isoDaysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString();
}

describe('server/log-stats', function () {

    describe('parseLine', function () {

        it('parses a real morgan line (ANSI-coloured)', function () {
            var line = morganLine('2026-05-17T12:34:56.000Z', '192.0.2.42', 'GET', '200', '/?q=mendel');
            var p = logStats.parseLine(line);
            expect(p).to.not.be.null;
            expect(p.ip).to.equal('192.0.2.42');
            expect(p.method).to.equal('GET');
            expect(p.status).to.equal(200);
            expect(p.url).to.equal('/?q=mendel');
            expect(p.tsMs).to.equal(Date.parse('2026-05-17T12:34:56.000Z'));
        });

        it('returns null for malformed lines', function () {
            expect(logStats.parseLine('')).to.be.null;
            expect(logStats.parseLine('   ')).to.be.null;
            expect(logStats.parseLine('garbage no fields')).to.be.null;
        });

        it('returns null for invalid timestamps', function () {
            var line = morganLine('not-a-date', '1.2.3.4', 'GET', '200', '/');
            expect(logStats.parseLine(line)).to.be.null;
        });

        it('handles IPv6 remote addresses', function () {
            var line = morganLine('2026-05-17T00:00:00.000Z', '2001:db8::1', 'GET', '200', '/');
            var p = logStats.parseLine(line);
            expect(p.ip).to.equal('2001:db8::1');
        });
    });

    describe('decodeQ', function () {
        it('decodes percent-encoding', function () {
            expect(logStats.decodeQ('/?q=mendel%27s')).to.equal("mendel's");
        });
        it('treats + as space', function () {
            expect(logStats.decodeQ('/?q=darwin+evolution')).to.equal('darwin evolution');
        });
        it('returns null when q= is absent', function () {
            expect(logStats.decodeQ('/?seed=abc')).to.be.null;
        });
        it('stops at &', function () {
            expect(logStats.decodeQ('/?q=mendel&start=10')).to.equal('mendel');
        });
        it('falls back to raw on malformed encoding', function () {
            expect(logStats.decodeQ('/?q=%E0%A4%A')).to.equal('%E0%A4%A');
        });
    });

    describe('isPublicPageLoad / isAggregator', function () {
        it('matches / and /aggregator.html with or without query strings', function () {
            expect(logStats.isPublicPageLoad('/')).to.be.true;
            expect(logStats.isPublicPageLoad('/?q=x')).to.be.true;
            expect(logStats.isPublicPageLoad('/aggregator.html')).to.be.true;
            expect(logStats.isPublicPageLoad('/aggregator.html?x=1')).to.be.true;
            expect(logStats.isPublicPageLoad('/refs')).to.be.false;
            expect(logStats.isPublicPageLoad('/profile')).to.be.false;
        });
        it('flags /aggregator.html specifically', function () {
            expect(logStats.isAggregator('/aggregator.html?print=1')).to.be.true;
            expect(logStats.isAggregator('/')).to.be.false;
        });
    });

    describe('getStats integration', function () {

        beforeEach(function () {
            for (var k in fakeFiles) delete fakeFiles[k];
            logStats.clearCache();
        });

        it('aggregates page loads, visitors, queries by day', async function () {
            var t1 = isoDaysAgo(0);
            var t2 = isoDaysAgo(1);
            fakeFiles['access.log'] = [
                morganLine(t1, '10.0.0.1', 'GET', '200', '/'),
                morganLine(t1, '10.0.0.1', 'GET', '200', '/?q=darwin'),
                morganLine(t1, '10.0.0.2', 'GET', '200', '/'),
                morganLine(t2, '10.0.0.3', 'GET', '200', '/aggregator.html'),
                morganLine(t2, '10.0.0.3', 'GET', '200', '/')
            ].join('\n');
            fakeFiles['queries.log'] = [
                morganLine(t1, '10.0.0.1', 'GET', '200', '/?q=darwin'),
                morganLine(t1, '10.0.0.1', 'GET', '200', '/?q=mendel'),
                morganLine(t2, '10.0.0.4', 'GET', '200', '/?seed=abc')
            ].join('\n');

            var s = await logStats.getStats();
            expect(s.labels).to.have.lengthOf(365);
            var todayIdx = s.labels.length - 1;
            var yesterdayIdx = todayIdx - 1;
            expect(s.pageLoads[todayIdx]).to.equal(3);
            expect(s.pageLoads[yesterdayIdx]).to.equal(2);
            expect(s.uniqueVisitors[todayIdx]).to.equal(2);
            expect(s.uniqueVisitors[yesterdayIdx]).to.equal(1);
            expect(s.queries[todayIdx]).to.equal(2);
            expect(s.queries[yesterdayIdx]).to.equal(1);
        });

        it('counts aggregator and random totals separately', async function () {
            var t = isoDaysAgo(0);
            fakeFiles['access.log'] = [
                morganLine(t, '1.1.1.1', 'GET', '200', '/aggregator.html'),
                morganLine(t, '1.1.1.2', 'GET', '200', '/aggregator.html?print=1'),
                morganLine(t, '1.1.1.3', 'GET', '200', '/')
            ].join('\n');
            fakeFiles['queries.log'] = [
                morganLine(t, '1.1.1.4', 'GET', '200', '/?seed=abc'),
                morganLine(t, '1.1.1.5', 'GET', '200', '/?seed=def'),
                morganLine(t, '1.1.1.6', 'GET', '200', '/?q=darwin')
            ].join('\n');

            var s = await logStats.getStats();
            expect(s.aggregatorTotal).to.equal(2);
            expect(s.randomTotal).to.equal(2);
        });

        it('excludes 4xx/5xx from page-load count', async function () {
            var t = isoDaysAgo(0);
            fakeFiles['access.log'] = [
                morganLine(t, '1.1.1.1', 'GET', '200', '/'),
                morganLine(t, '1.1.1.2', 'GET', '404', '/'),
                morganLine(t, '1.1.1.3', 'GET', '500', '/aggregator.html')
            ].join('\n');
            fakeFiles['queries.log'] = '';

            var s = await logStats.getStats();
            var idx = s.labels.length - 1;
            expect(s.pageLoads[idx]).to.equal(1);
            expect(s.aggregatorTotal).to.equal(0);
        });

        it('builds histogram with visitors who made 0 queries', async function () {
            var t = isoDaysAgo(0);
            // Two visitors loaded the public site; only one ran a query.
            fakeFiles['access.log'] = [
                morganLine(t, '1.1.1.1', 'GET', '200', '/'),
                morganLine(t, '1.1.1.2', 'GET', '200', '/')
            ].join('\n');
            fakeFiles['queries.log'] = [
                morganLine(t, '1.1.1.1', 'GET', '200', '/?q=darwin'),
                morganLine(t, '1.1.1.1', 'GET', '200', '/?q=mendel'),
                morganLine(t, '1.1.1.1', 'GET', '200', '/?q=evolution')
            ].join('\n');

            var s = await logStats.getStats();
            // 1.1.1.2 made 0 queries -> bin '0'; 1.1.1.1 made 3 -> bin '3'.
            expect(s.histogramBins[0]).to.equal('0');
            expect(s.histogramBins[s.histogramBins.length - 1]).to.equal('10+');
            expect(s.histogramCounts[0]).to.equal(1);
            expect(s.histogramCounts[3]).to.equal(1);
            expect(s.histogramCounts[1]).to.equal(0);
        });

        it('puts visitors with >10 queries into the 10+ bin', async function () {
            var t = isoDaysAgo(0);
            fakeFiles['access.log'] = morganLine(t, '1.1.1.1', 'GET', '200', '/');
            var lines = [];
            for (var i = 0; i < 15; i++) {
                lines.push(morganLine(t, '1.1.1.1', 'GET', '200', '/?q=q' + i));
            }
            fakeFiles['queries.log'] = lines.join('\n');

            var s = await logStats.getStats();
            expect(s.histogramCounts[11]).to.equal(1);
            for (var b = 0; b < 11; b++) expect(s.histogramCounts[b]).to.equal(0);
        });

        it('returns the most recent 50 queries with q= decoded, newest first', async function () {
            fakeFiles['access.log'] = '';
            var lines = [];
            // 60 queries spread one minute apart, oldest first to mimic
            // morgan's append order.
            var base = Date.now() - 60 * 60000;
            for (var i = 0; i < 60; i++) {
                var ts = new Date(base + i * 60000).toISOString();
                lines.push(morganLine(ts, '1.1.1.' + (i % 5), 'GET', '200', '/?q=term' + i));
            }
            fakeFiles['queries.log'] = lines.join('\n');

            var s = await logStats.getStats();
            expect(s.recentQueries).to.have.lengthOf(50);
            expect(s.recentQueries[0].q).to.equal('term59');
            expect(s.recentQueries[49].q).to.equal('term10');
            // Sorted newest first
            for (var k = 0; k < s.recentQueries.length - 1; k++) {
                expect(s.recentQueries[k].t >= s.recentQueries[k + 1].t).to.be.true;
            }
        });

        it('skips entries older than the 365-day cutoff', async function () {
            var recent = isoDaysAgo(0);
            var ancient = isoDaysAgo(400);
            fakeFiles['access.log'] = [
                morganLine(recent, '1.1.1.1', 'GET', '200', '/'),
                morganLine(ancient, '1.1.1.99', 'GET', '200', '/')
            ].join('\n');
            fakeFiles['queries.log'] = '';

            var s = await logStats.getStats();
            // Only the recent visitor is counted; the ancient one was outside
            // the labels window and dropped.
            var todayIdx = s.labels.length - 1;
            expect(s.pageLoads[todayIdx]).to.equal(1);
            expect(s.histogramCounts.reduce(function (a, b) { return a + b; }, 0)).to.equal(1);
        });

        it('reads rotated files until one yields no in-range data', async function () {
            var t = isoDaysAgo(0);
            fakeFiles['access.log'] = morganLine(t, '1.1.1.1', 'GET', '200', '/');
            fakeFiles['access.log.1'] = morganLine(t, '1.1.1.2', 'GET', '200', '/');
            // No access.log.2 — ENOENT stops the walk.
            fakeFiles['queries.log'] = '';

            var s = await logStats.getStats();
            expect(s.uniqueVisitors[s.labels.length - 1]).to.equal(2);
        });

        it('survives a fully missing access.log', async function () {
            fakeFiles['queries.log'] = '';
            // No 'access.log' fixture -> ENOENT immediately.
            var s = await logStats.getStats();
            var idx = s.labels.length - 1;
            expect(s.pageLoads[idx]).to.equal(0);
            expect(s.uniqueVisitors[idx]).to.equal(0);
            expect(s.aggregatorTotal).to.equal(0);
        });

        it('memoises within the TTL — concurrent calls share one scan', async function () {
            fakeFiles['access.log'] = '';
            fakeFiles['queries.log'] = '';
            var createSpy = sinon.spy(fsStub, 'createReadStream');
            try {
                var p1 = logStats.getStats();
                var p2 = logStats.getStats();
                expect(p1).to.equal(p2);
                await Promise.all([p1, p2]);
                // Two log streams (access + queries) were opened once each.
                expect(createSpy.callCount).to.equal(2);
            } finally {
                createSpy.restore();
            }
        });
    });
});
