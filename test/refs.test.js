var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

// Stubs for external dependencies
var fsStub = {
    readFileSync: sinon.stub(),
    writeFileSync: sinon.stub()
};

var solrClientStub = {
    add: sinon.stub(),
    get: sinon.stub(),
    deleteByID: sinon.stub()
};

var sourceClientStub = {
    get: sinon.stub()
};

var solrStub = {
    createClient: sinon.stub().callsFake(function (host, port, core) {
        if (core === 'source') return sourceClientStub;
        return solrClientStub;
    })
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

// Load the refs router with mocked dependencies
var refsRouter = proxyquire('../routes/refs', {
    'fs': fsStub,
    'solr-client': solrStub,
    'log4js': log4jsStub,
    '../config/solr-proxy': proxyquire('../config/solr-proxy', {
        'http-proxy': fakeProxy
    })
});

var dbJson = {
    numRecords: 100,
    highestId: 500,
    latest: '2025-01-01',
    updated: '2025-01-01'
};

describe('Refs Routes', function () {

    beforeEach(function () {
        // Reset stubs
        fsStub.readFileSync.returns(JSON.stringify(dbJson));
        fsStub.writeFileSync.reset();
        solrClientStub.add.reset();
        solrClientStub.get.reset();
        solrClientStub.deleteByID.reset();
        sourceClientStub.get.reset();
        auditLoggerStub.info.reset();
    });

    describe('POST /new', function () {

        it('should reject empty submissions with JSON error', function () {
            var req = mockReq({
                method: 'POST',
                body: {},
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.equal('No data input. Reference not created.');
        });

        it('should reject invalid ISO 8601 dates with JSON error', function () {
            var req = mockReq({
                method: 'POST',
                body: { date: 'not-a-date', title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('ISO 8601');
        });

        it('should accept valid date format', function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test Title', date: '2025-06-15' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.title).to.equal('Test Title');
            expect(doc.dt).to.equal('2025-06-15');
            expect(doc.id).to.equal(501);
        });

        it('should increment highestId and numRecords on success', function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Author' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(fsStub.writeFileSync.calledOnce).to.be.true;
            var written = JSON.parse(fsStub.writeFileSync.firstCall.args[1]);
            expect(written.highestId).to.equal(501);
            expect(written.numRecords).to.equal(101);
        });

        it('should return JSON error on Solr failure', function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(new Error('Solr down'), null); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res._json.error).to.include('problem occurred');
            expect(fsStub.writeFileSync.called).to.be.false;
        });

        it('should return JSON redirect on success', function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Test Author' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(res._json.redirect).to.include('/refs');
            expect(res._json.redirect).to.include('501');
        });

        it('should reject unknown source with JSON error', function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test', source: 'Nonexistent Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.callsFake(function (path, query, cb) {
                cb(null, { response: { numFound: 0, docs: [] } });
            });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('not found');
            expect(solrClientStub.add.called).to.be.false;
        });

        it('should accept known source', function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test', source: 'Known Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.callsFake(function (path, query, cb) {
                cb(null, { response: { numFound: 1, docs: [{ name: 'Known Journal' }] } });
            });
            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            expect(res._json.redirect).to.include('/refs');
        });

        it('should allow save when source index is unreachable', function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test', source: 'Some Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.callsFake(function (path, query, cb) {
                cb(new Error('Connection refused'), null);
            });
            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            expect(res._json.redirect).to.include('/refs');
        });

        it('should write audit log on success', function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Test Author' },
                user: mockUser({ email: 'editor@test.com' }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.callsFake(function (doc, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'post', '/new');
            handler(req, res, next);

            expect(auditLoggerStub.info.calledOnce).to.be.true;
            var logMsg = auditLoggerStub.info.firstCall.args[0];
            expect(logMsg).to.include('editor@test.com');
            expect(logMsg).to.include('added a new reference');
        });
    });

    describe('POST /:id (edit)', function () {

        it('should reject invalid ISO 8601 dates with JSON error', function () {
            var req = mockReq({
                method: 'POST',
                params: { id: '42' },
                query: {},
                body: { date: 'bad-date', title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(refsRouter, 'post', '/:id(\\d+)');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('ISO 8601');
        });

        it('should reject unknown source on edit', function () {
            var req = mockReq({
                method: 'POST',
                params: { id: '42' },
                query: {},
                body: { title: 'Test', source: 'Bad Source' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.callsFake(function (path, query, cb) {
                cb(null, { response: { numFound: 0, docs: [] } });
            });

            var handler = findHandler(refsRouter, 'post', '/:id(\\d+)');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('not found');
            expect(solrClientStub.get.called).to.be.false;
        });

        it('should return JSON error on Solr get failure', function () {
            var req = mockReq({
                method: 'POST',
                params: { id: '42' },
                query: {},
                body: { title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.get.callsFake(function (path, query, cb) {
                cb(new Error('Solr down'), null);
            });

            var handler = findHandler(refsRouter, 'post', '/:id(\\d+)');
            handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res._json.error).to.include('audit log');
        });
    });

    describe('DELETE /:id', function () {

        it('should reject users with permission < 1', function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: '42' },
                query: {},
                user: mockUser({ permission: 0 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(refsRouter, 'delete', '/:id(\\d+)');
            handler(req, res, next);

            expect(res.redirect.firstCall.args[0]).to.equal(403);
        });

        it('should decrement numRecords on successful delete', function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: '42' },
                query: {},
                user: mockUser({ permission: 1 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.get.callsFake(function (path, query, cb) {
                cb(null, { response: { docs: [{ id: 42, title: 'Old Doc' }] } });
            });
            solrClientStub.deleteByID.callsFake(function (id, cb) { cb(null, {}); });

            var handler = findHandler(refsRouter, 'delete', '/:id(\\d+)');
            handler(req, res, next);

            expect(fsStub.writeFileSync.calledOnce).to.be.true;
            var written = JSON.parse(fsStub.writeFileSync.firstCall.args[1]);
            expect(written.numRecords).to.equal(99);
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
