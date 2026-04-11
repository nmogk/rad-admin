var expect = require('chai').expect;
var sinon = require('sinon');
var { mockReq, mockRes } = require('./helpers');

// We need to require solr-proxy carefully since it creates a proxy server on load.
// Use proxyquire to stub http-proxy so no real server is created.
var proxyquire = require('proxyquire').noCallThru();

var fakeProxy = {
    createProxyServer: sinon.stub().returns({ web: sinon.stub() })
};

var log4jsStub = {
    getLogger: sinon.stub().returns({ info: sinon.stub(), debug: sinon.stub() })
};

var solrProxy = proxyquire('../config/solr-proxy', {
    'http-proxy': fakeProxy,
    'log4js': log4jsStub
});

var validateRequest = solrProxy.validateRequest;
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

    describe('proxyLogic', function () {

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
        });
    });
});
