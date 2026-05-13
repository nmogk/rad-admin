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
            expect(maxRequestedRows('/solr/rad/refs?q=*:*')).to.equal(0);
        });

        it('returns the rows value when present', function () {
            expect(maxRequestedRows('/solr/rad/refs?q=foo&rows=500')).to.equal(500);
        });

        it('returns 0 for a non-numeric rows', function () {
            expect(maxRequestedRows('/solr/rad/refs?rows=abc')).to.equal(0);
        });

        it('returns the largest value when rows appears more than once', function () {
            expect(maxRequestedRows('/solr/rad/refs?rows=10&rows=99999')).to.equal(99999);
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

        it('forwards a valid request unchanged when rows is under the limit', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo&rows=10',
                query: { q: 'foo', rows: '10' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(webStub.calledOnce).to.be.true;
            expect(req.url).to.equal('/solr/rad/refs?q=foo&rows=10');
        });

        it('forwards a valid request unchanged when rows equals the limit', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo&rows=1000',
                query: { q: 'foo', rows: '1000' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(webStub.calledOnce).to.be.true;
            expect(req.url).to.equal('/solr/rad/refs?q=foo&rows=1000');
        });

        it('forwards a valid request when rows is missing', function () {
            var req = mockReq({
                method: 'GET',
                baseUrl: '/solr/rad/refs',
                originalUrl: '/solr/rad/refs?q=foo',
                query: { q: 'foo' }
            });
            var res = mockRes();

            solrProxy(req, res);

            expect(webStub.calledOnce).to.be.true;
            expect(req.url).to.equal('/solr/rad/refs?q=foo');
        });
    });
});
