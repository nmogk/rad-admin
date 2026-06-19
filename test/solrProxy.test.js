var expect = require('chai').expect;
var sinon = require('sinon');
var { mockReq, mockRes } = require('./helpers');

// We need to require solr-proxy carefully since it creates a proxy server on load.
// Use proxyquire to stub httpxy so no real server is created.
var proxyquire = require('proxyquire').noCallThru();

var webStub = sinon.stub();
var fakeProxy = {
    createProxyServer: sinon.stub().returns({ web: webStub })
};

var log4jsStub = {
    getLogger: sinon.stub().returns({ info: sinon.stub(), debug: sinon.stub() })
};

var solrProxy = proxyquire('../config/solr-proxy', {
    'httpxy': fakeProxy,
    'log4js': log4jsStub
});

var validateRequest = solrProxy.validateRequest;
var maxRequestedRows = solrProxy.maxRequestedRows;
var rewriteBoost = solrProxy.rewriteBoost;
var proxyOptions = solrProxy.proxyOptions;

describe('Solr Proxy', function () {

    describe('validateRequest', function () {

        it('should allow a valid GET to /solr/rad/refs', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: { q: '*:*', rows: '10' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.true;
        });

        it('should allow a valid GET to /solr/rad/refs/csv', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs/csv',
                query: { q: 'test' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.true;
        });

        it('should allow a valid GET to /solr/source/select', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/source/select',
                query: { q: 'source:test' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.true;
        });

        it('should allow requests with no query params', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: {}
            });
            expect(validateRequest(req, proxyOptions)).to.be.true;
        });

        it('should reject POST requests', function () {
            var req = mockReq({
                method: 'POST',
                baseUrl: '/solr/rad/refs',
                query: {}
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject PUT requests', function () {
            var req = mockReq({
                method: 'PUT',
                baseUrl: '/solr/rad/refs',
                query: {}
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject DELETE requests', function () {
            var req = mockReq({
                method: 'DELETE',
                baseUrl: '/solr/rad/refs',
                query: {}
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject requests to /solr/admin', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/admin',
                query: {}
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject requests to /solr/update', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/update',
                query: {}
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject qt parameter', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: { qt: '/update' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject stream parameter', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: { stream: 'true' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject stream.url parameter', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: { 'stream.url': 'http://evil.com' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should reject stream.body parameter', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: { 'stream.body': 'payload' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.false;
        });

        it('should allow valid params alongside q', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                query: { q: '*:*', rows: '10', start: '0', sort: 'id asc', wt: 'json' }
            });
            expect(validateRequest(req, proxyOptions)).to.be.true;
        });
    });

    describe('maxRequestedRows', function () {

        it('returns 0 when rows is missing', function () {
            expect(maxRequestedRows(undefined)).to.equal(0);
        });

        it('returns the rows value when present', function () {
            expect(maxRequestedRows('500')).to.equal(500);
        });

        it('returns 0 for a non-numeric rows', function () {
            expect(maxRequestedRows('abc')).to.equal(0);
        });

        it('returns the largest value when rows appears more than once', function () {
            expect(maxRequestedRows(['10', '99999'])).to.equal(99999);
        });
    });

    describe('proxyLogic', function () {

        beforeEach(function () {
            webStub.resetHistory();
        });

        it('should return 403 for invalid requests', function () {
            var req = mockReq({
                method: 'POST',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs',
                query: {}
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(res.writeHead.calledOnce).to.be.true;
            expect(res.writeHead.firstCall.args[0]).to.equal(403);
            expect(res.end.calledOnce).to.be.true;
            expect(webStub.called).to.be.false;
        });

        it('rejects with 400 when rows exceeds maxRows', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo&rows=9999',
                query: { q: 'foo', rows: '9999' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(res.writeHead.calledOnce).to.be.true;
            expect(res.writeHead.firstCall.args[0]).to.equal(400);
            expect(res.write.firstCall.args[0]).to.contain(String(proxyOptions.maxRows));
            expect(res.end.calledOnce).to.be.true;
            expect(webStub.called).to.be.false;
        });

        it('rejects when one of multiple rows values exceeds maxRows', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?rows=10&rows=99999',
                query: { rows: ['10', '99999'] }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(res.writeHead.firstCall.args[0]).to.equal(400);
            expect(webStub.called).to.be.false;
        });

        it('rejects when CSV endpoint exceeds maxRows', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs/csv',
                originalUrl: '/solr/rad/refs/csv?q=foo&rows=50000',
                query: { q: 'foo', rows: '50000' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(res.writeHead.firstCall.args[0]).to.equal(400);
            expect(webStub.called).to.be.false;
        });

        it('forwards a valid request and injects boost=1 when rows is under the limit', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo&rows=10',
                query: { q: 'foo', rows: '10' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(webStub.calledOnce).to.be.true;
            // Proxy now always sends an explicit boost on refs paths (#160);
            // absence in the incoming URL means "off" -> boost=1.
            expect(req.url).to.equal('/solr/rad/refs?q=foo&rows=10&boost=1');
        });

        it('forwards a valid request and injects boost=1 when rows equals the limit', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo&rows=1000',
                query: { q: 'foo', rows: '1000' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(webStub.calledOnce).to.be.true;
            expect(req.url).to.equal('/solr/rad/refs?q=foo&rows=1000&boost=1');
        });

        it('forwards a valid request and injects boost=1 when rows is missing', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo',
                query: { q: 'foo' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(webStub.calledOnce).to.be.true;
            expect(req.url).to.equal('/solr/rad/refs?q=foo&boost=1');
        });
    });

    describe('rewriteBoost (#160)', function () {

        var clock;

        beforeEach(function () {
            // Pin Date so the recip() year embedded in the rewritten URL is
            // deterministic. 2026-06-15 -> currentYear + margin (3) = 2029.
            clock = sinon.useFakeTimers(new Date('2026-06-15T00:00:00Z').getTime());
        });

        afterEach(function () {
            clock.restore();
        });

        it('rewrites boost=1 on /solr/rad/refs to a recip() function using the current year + margin', function () {
            var out = rewriteBoost('/solr/rad/refs?q=foo&boost=1', '/solr/rad/refs');
            // recip(sub(2029,year),0.3,1,1) URL-encoded.
            expect(out).to.contain('boost=recip%28sub%282029%2Cyear%29%2C0.3%2C1%2C1%29');
            expect(out).to.contain('q=foo');
        });

        it('injects boost=1 when the incoming URL has no boost param', function () {
            var out = rewriteBoost('/solr/rad/refs?q=mendel&rows=30', '/solr/rad/refs');
            expect(out).to.equal('/solr/rad/refs?q=mendel&rows=30&boost=1');
        });

        it('treats any non-"1" boost value as "off" and rewrites to boost=1', function () {
            var out = rewriteBoost('/solr/rad/refs?q=foo&boost=0', '/solr/rad/refs');
            expect(out).to.contain('boost=1');
            expect(out).to.not.contain('boost=0');
            expect(out).to.not.contain('recip');
        });

        it('applies the same rewrite to /solr/rad/refs/csv', function () {
            var withBoost = rewriteBoost('/solr/rad/refs/csv?q=foo&boost=1', '/solr/rad/refs/csv');
            expect(withBoost).to.contain('boost=recip%28sub%282029%2Cyear%29%2C0.3%2C1%2C1%29');

            var withoutBoost = rewriteBoost('/solr/rad/refs/csv?q=foo', '/solr/rad/refs/csv');
            expect(withoutBoost).to.equal('/solr/rad/refs/csv?q=foo&boost=1');
        });

        it('leaves /solr/source/select untouched regardless of boost value', function () {
            var u1 = '/solr/source/select?q=Answers';
            expect(rewriteBoost(u1, '/solr/source/select')).to.equal(u1);

            var u2 = '/solr/source/select?q=Answers&boost=1';
            expect(rewriteBoost(u2, '/solr/source/select')).to.equal(u2);
        });

        it('preserves repeated and multi-valued query params (e.g. type, fq)', function () {
            var out = rewriteBoost(
                '/solr/rad/refs?q=foo&fq=type%3A%22book%22&fq=year%3A%5B2000+TO+%2A%5D',
                '/solr/rad/refs'
            );
            // Both fq values still present after re-serialisation. URLSearchParams
            // leaves * alone (form-urlencoded "safe" char) and emits + for spaces.
            expect(out).to.match(/fq=type%3A%22book%22/);
            expect(out).to.match(/fq=year%3A%5B2000(\+|%20)TO(\+|%20)(\*|%2A)%5D/);
            expect(out).to.contain('boost=1');
        });

        it('uses the first boost value when the param is repeated', function () {
            var out = rewriteBoost('/solr/rad/refs?boost=1&boost=0', '/solr/rad/refs');
            // First value wins -> treated as "1" -> recip()
            expect(out).to.contain('boost=recip');
            expect(out).to.not.contain('boost=0');
        });

        it('uses Date().getFullYear() so the boost year advances automatically', function () {
            clock.restore();
            // Mid-year pin so getFullYear() returns the same year in every
            // local timezone (UTC midnight on Jan 1 can fall in the prior
            // year for negative-offset zones).
            clock = sinon.useFakeTimers(new Date('2031-06-15T00:00:00Z').getTime());

            var out = rewriteBoost('/solr/rad/refs?q=foo&boost=1', '/solr/rad/refs');
            // 2031 + 3 = 2034.
            expect(out).to.contain('boost=recip%28sub%282034%2Cyear%29%2C0.3%2C1%2C1%29');
        });
    });
});
