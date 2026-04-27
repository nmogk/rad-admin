var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var dbStub = {
    read: sinon.stub(),
    getHighestId: sinon.stub(),
    reserveId: sinon.stub(),
    recordInsert: sinon.stub(),
    recordEdit: sinon.stub(),
    recordDelete: sinon.stub()
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
    createClient: sinon.stub().callsFake(function (opts) {
        if (opts.core === 'source') return sourceClientStub;
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

var refsRouter = proxyquire('../routes/refs', {
    '../config/solr-client': solrStub,
    '../config/database-json': dbStub,
    'log4js': log4jsStub,
    '../config/solr-proxy': proxyquire('../config/solr-proxy', {
        'http-proxy': fakeProxy
    })
});

// Wait one full microtask cycle so .then() callbacks queued by stubs run.
function flush() {
    return new Promise(function (r) { setImmediate(r); });
}

describe('Refs Routes', function () {

    beforeEach(function () {
        dbStub.read.reset();
        dbStub.read.resolves({ numRecords: 100, highestId: 500, latest: '2025-01-01', updated: '2025-01-01' });
        dbStub.getHighestId.reset();
        dbStub.getHighestId.resolves(500);
        dbStub.reserveId.reset();
        dbStub.reserveId.resolves(501);
        dbStub.recordInsert.reset();
        dbStub.recordInsert.resolves();
        dbStub.recordEdit.reset();
        dbStub.recordEdit.resolves();
        dbStub.recordDelete.reset();
        dbStub.recordDelete.resolves();
        solrClientStub.add.reset();
        solrClientStub.get.reset();
        solrClientStub.deleteByID.reset();
        sourceClientStub.get.reset();
        auditLoggerStub.info.reset();
    });

    describe('POST /new', function () {

        it('should reject empty submissions with JSON error', async function () {
            var req = mockReq({
                method: 'POST',
                body: {},
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.equal('No data input. Reference not created.');
        });

        it('should reject invalid ISO 8601 dates with JSON error', async function () {
            var req = mockReq({
                method: 'POST',
                body: { date: 'not-a-date', title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('ISO 8601');
        });

        it('should accept valid date format', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test Title', date: '2025-06-15' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.title).to.equal('Test Title');
            expect(doc.dt).to.equal('2025-06-15');
            expect(doc.id).to.equal(501);
        });

        it('should call recordInsert with the doc date on success', async function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Author', date: '2025-06-15' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(dbStub.recordInsert.calledOnce).to.be.true;
            expect(dbStub.recordInsert.firstCall.args[0]).to.equal('2025-06-15');
        });

        it('should return JSON error on Solr failure and not record insert', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.rejects(new Error('Solr down'));

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res._json.error).to.include('problem occurred');
            expect(dbStub.recordInsert.called).to.be.false;
        });

        it('should return JSON redirect on success', async function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Test Author' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(res._json.redirect).to.include('/refs');
            expect(res._json.redirect).to.include('501');
        });

        it('should reject unknown source with JSON error', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test', source: 'Nonexistent Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.resolves({ response: { numFound: 0, docs: [] } });

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('not found');
            expect(solrClientStub.add.called).to.be.false;
        });

        it('should accept known source', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test', source: 'Known Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.resolves({ response: { numFound: 1, docs: [{ name: 'Known Journal' }] } });
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            expect(res._json.redirect).to.include('/refs');
        });

        it('should allow save when source index is unreachable', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Test', source: 'Some Journal' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.rejects(new Error('Connection refused'));
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(solrClientStub.add.calledOnce).to.be.true;
            expect(res._json.redirect).to.include('/refs');
        });

        it('should write audit log on success', async function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Test Author' },
                user: mockUser({ email: 'editor@test.com' }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, next);

            expect(auditLoggerStub.info.calledOnce).to.be.true;
            var logMsg = auditLoggerStub.info.firstCall.args[0];
            expect(logMsg).to.include('editor@test.com');
            expect(logMsg).to.include('added a new reference');
        });
    });

    describe('POST /:id (edit)', function () {

        it('should reject invalid ISO 8601 dates with JSON error', async function () {
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
            await handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('ISO 8601');
        });

        it('should reject unknown source on edit', async function () {
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

            sourceClientStub.get.resolves({ response: { numFound: 0, docs: [] } });

            var handler = findHandler(refsRouter, 'post', '/:id(\\d+)');
            await handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res._json.error).to.include('not found');
            expect(solrClientStub.get.called).to.be.false;
        });

        it('should return JSON error on Solr get failure', async function () {
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

            solrClientStub.get.rejects(new Error('Solr down'));

            var handler = findHandler(refsRouter, 'post', '/:id(\\d+)');
            await handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res._json.error).to.include('audit log');
        });

        it('should preserve the request query in the redirect URL', async function () {
            var req = mockReq({
                method: 'POST',
                params: { id: '42' },
                query: { q: 'author:Smith', rows: '10' },
                body: { title: 'Test' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            sourceClientStub.get.resolves({ response: { numFound: 1, docs: [] } });
            solrClientStub.get.resolves({ response: { docs: [{ id: '42' }] } });
            solrClientStub.add.resolves();

            var handler = findHandler(refsRouter, 'post', '/:id(\\d+)');
            await handler(req, res, next);

            expect(res._json.redirect).to.include('q=author');
            expect(res._json.redirect).to.include('rows=10');
        });
    });

    describe('POST /new sanitization', function () {

        it('normalises smart quotes in title to straight quotes', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'a' + '“' + 'b' + '”' + ' ' + '‘' + 'c' + '’' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.title).to.equal('a"b" \'c\'');
        });

        it('replaces NBSP in author with a regular space', async function () {
            var req = mockReq({
                method: 'POST',
                body: { author: 'Jane' + ' ' + 'Doe' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.author).to.equal('Jane Doe');
        });

        it('replaces en/em dashes in reference with a hyphen', async function () {
            var req = mockReq({
                method: 'POST',
                body: { reference: 'Vol 1' + '–' + '2' + '—' + 'pages' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.reference).to.equal('Vol 1-2-pages');
        });

        it('replaces ellipsis in abstract with three dots', async function () {
            var req = mockReq({
                method: 'POST',
                body: { abst: 'continued' + '…' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.abstract).to.equal('continued...');
        });

        it('strips zero-width chars from source and queries Solr with the cleaned name', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'T', source: 'Nature' + '​' + '‌' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            sourceClientStub.get.resolves({ response: { numFound: 1, docs: [{ name: 'Nature' }] } });
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var sourceQuery = sourceClientStub.get.firstCall.args[1];
            expect(sourceQuery).to.include('name:"Nature"');
            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.source).to.equal('Nature');
        });

        it('strips control characters from title', async function () {
            var req = mockReq({
                method: 'POST',
                body: { title: 'Hello' + '' + 'World' + '' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.title).to.equal('HelloWorld');
        });

        it('preserves tab and LF in abstract', async function () {
            var req = mockReq({
                method: 'POST',
                body: { abst: 'line1\n\tindented\nline2' },
                user: mockUser(),
                flash: sinon.stub()
            });
            var res = mockRes();
            solrClientStub.add.resolves({});

            var handler = findHandler(refsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            var doc = solrClientStub.add.firstCall.args[0];
            expect(doc.abstract).to.equal('line1\n\tindented\nline2');
        });
    });

    describe('DELETE /:id', function () {

        it('should reject users with permission < 1', async function () {
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
            await handler(req, res, next);

            expect(res.redirect.firstCall.args[0]).to.equal(403);
            expect(solrClientStub.deleteByID.called).to.be.false;
        });

        it('should call recordDelete on successful delete', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: '42' },
                query: {},
                user: mockUser({ permission: 1 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.deleteByID.resolves({ id: 42, title: 'Old Doc' });

            var handler = findHandler(refsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, next);
            await flush();

            expect(solrClientStub.deleteByID.calledOnce).to.be.true;
            expect(solrClientStub.deleteByID.firstCall.args[0]).to.equal('42');
            expect(dbStub.recordDelete.calledOnce).to.be.true;
            expect(auditLoggerStub.info.calledOnce).to.be.true;
            var logMsg = auditLoggerStub.info.firstCall.args[0];
            expect(logMsg).to.include('Old Doc');
        });

        it('should set flash before responding so it persists in the session', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: '42' },
                query: {},
                user: mockUser({ permission: 1 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.deleteByID.resolves({ id: 42 });

            var handler = findHandler(refsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, next);

            expect(req.flash.calledWith('yay')).to.be.true;
            expect(res._json).to.not.be.null;
            expect(res._json.redirect).to.include('/refs');
            // Flash must be set before res.json so express-session saves it.
            expect(req.flash.calledBefore(res.json)).to.be.true;
        });

        it('should preserve the request query in the redirect URL', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: '42' },
                query: { q: 'author:Smith', rows: '10' },
                user: mockUser({ permission: 1 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.deleteByID.resolves({ id: 42 });

            var handler = findHandler(refsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, next);

            expect(res._json.redirect).to.include('q=author');
            expect(res._json.redirect).to.include('rows=10');
        });

        it('should flash an error and respond when delete fails', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { id: '42' },
                query: {},
                user: mockUser({ permission: 1 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            solrClientStub.deleteByID.rejects(new Error('solr down'));

            var handler = findHandler(refsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, next);

            expect(req.flash.calledWith('error')).to.be.true;
            expect(res._json).to.not.be.null;
        });
    });
});

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
