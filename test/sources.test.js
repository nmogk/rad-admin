var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

// Stubs for external dependencies
var solrClientStub = {
    add: sinon.stub(),
    get: sinon.stub(),
    deleteByID: sinon.stub()
};

var solrStub = {
    createClient: sinon.stub().returns(solrClientStub)
};

var auditLoggerStub = {
    info: sinon.stub()
};

var log4jsStub = {
    getLogger: sinon.stub().returns(auditLoggerStub)
};

var fakeProxy = {
    createProxyServer: sinon.stub().returns({ web: sinon.stub() })
};

// Load the sources router with mocked dependencies
var sourcesRouter = proxyquire('../routes/sources', {
    'solr-client': solrStub,
    'log4js': log4jsStub,
    '../config/solr-proxy': proxyquire('../config/solr-proxy', {
        'http-proxy': fakeProxy
    })
});

describe('Sources Routes', function () {

    beforeEach(function () {
        solrClientStub.add.reset();
        solrClientStub.get.reset();
        solrClientStub.deleteByID.reset();
        auditLoggerStub.info.reset();
    });

    describe('POST /new', function () {

        it('should reject submissions without a name', function () {
            var req = mockReq({
                method: 'POST',
                body: { city: 'Springfield' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(sourcesRouter, 'post', '/new');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('name is required');
        });

        it('should accept valid source and return redirect', function () {
            var req = mockReq({
                method: 'POST',
                body: { name: 'Test Journal', city: 'Springfield' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(sourcesRouter, 'post', '/new');
            handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.name).to.equal('Test Journal');
            expect(doc.city).to.equal('Springfield');
            expect(res._json.redirect).to.include('/sources');
            expect(res._json.redirect).to.include('name:');
        });

        it('should return JSON error on Solr failure', function () {
            var req = mockReq({
                method: 'POST',
                body: { name: 'Test Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(new Error('Solr down'), null); });

            var handler = findHandler(sourcesRouter, 'post', '/new');
            handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res._json.error).to.include('problem occurred');
        });

        it('should write audit log on success', function () {
            var req = mockReq({
                method: 'POST',
                body: { name: 'Test Journal' },
                user: mockUser({ email: 'editor@test.com' }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(sourcesRouter, 'post', '/new');
            handler(req, res, next);

            expect(auditLoggerStub.info.calledOnce).to.be.true;
            var logMsg = auditLoggerStub.info.firstCall.args[0];
            expect(logMsg).to.include('editor@test.com');
            expect(logMsg).to.include('added a new source');
        });
    });

    describe('POST /:id (edit)', function () {

        it('should return JSON error on Solr get failure', function () {
            var req = mockReq({
                method: 'POST',
                params: { id: 'abc-123' },
                query: {},
                body: { name: 'Updated Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.get.callsFake(function (path, query, cb) {
                cb(new Error('Solr down'), null);
            });

            var handler = findHandler(sourcesRouter, 'post', '/:id');
            handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res._json.error).to.include('audit log');
        });

        it('should update source and return redirect', function () {
            var req = mockReq({
                method: 'POST',
                params: { id: 'abc-123' },
                query: {},
                body: { name: 'Updated Journal', city: 'New City' },
                user: mockUser({ email: 'editor@test.com' }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.get.callsFake(function (path, query, cb) {
                cb(null, { response: { docs: [{ id: 'abc-123', name: 'Old Journal' }] } });
            });
            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(sourcesRouter, 'post', '/:id');
            handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.id).to.equal('abc-123');
            expect(doc.name).to.equal('Updated Journal');
            expect(res._json.redirect).to.include('/sources');
            expect(auditLoggerStub.info.calledOnce).to.be.true;
        });
    });

    describe('DELETE /:id', function () {

        it('should reject users with permission < 1', function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: 'abc-123' },
                query: {},
                user: mockUser({ permission: 0 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(sourcesRouter, 'delete', '/:id');
            handler(req, res, next);

            expect(res.redirect.firstCall.args[0]).to.equal(403);
        });

        it('should delete source and return redirect', function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: 'abc-123' },
                query: {},
                user: mockUser({ permission: 1 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.get.callsFake(function (path, query, cb) {
                cb(null, { response: { docs: [{ id: 'abc-123', name: 'Test Journal' }] } });
            });
            solrClientStub.deleteByID.callsFake(function (id, cb) { cb(null, {}); });

            var handler = findHandler(sourcesRouter, 'delete', '/:id');
            handler(req, res, next);

            expect(solrClientStub.deleteByID.calledOnce).to.be.true;
            expect(res._json.redirect).to.include('/sources');
            expect(auditLoggerStub.info.calledOnce).to.be.true;
        });
    });
});

/**
 * Helper to find a route handler from an Express router by method and path.
 */
function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route &&
            l.route.path === path &&
            l.route.methods[method];
    });
    if (!layer) {
        throw new Error('No handler found for ' + method.toUpperCase() + ' ' + path);
    }
    return layer.route.stack[0].handle;
}
