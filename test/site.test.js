var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser, mockQueryBuilder } = require('./helpers');

var fakeSections = [
    { section_key: 'backstory', title: 'Story', content: '<p>Hello</p>', updated_at: '2026-04-10T12:00:00Z', updated_by: 'admin@test.com' },
    { section_key: 'search_help', title: 'Help', content: '<p>Search</p>', updated_at: null, updated_by: null }
];

var siteQb;
var SiteContentStub = { query: sinon.stub() };

var log4jsStub = {
    getLogger: sinon.stub().returns({
        info: sinon.stub()
    })
};

var fsStub = {
    readFileSync: sinon.stub().returns('<p>From file</p>')
};

var siteRouter = proxyquire('../routes/site', {
    '../models/site-content': SiteContentStub,
    'log4js': log4jsStub,
    'fs': fsStub
});

describe('Site Routes', function () {

    beforeEach(function () {
        siteQb = mockQueryBuilder();
        siteQb.resolves(fakeSections);
        SiteContentStub.query.reset();
        SiteContentStub.query.returns(siteQb);
        fsStub.readFileSync.resetHistory();
        fsStub.readFileSync.returns('<p>From file</p>');
    });

    describe('GET /', function () {

        it('should render site view with sections data', async function () {
            var user = mockUser({ permission: 1 });
            var req = mockReq({ user: user, replacements: {} });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'get', '/');
            await handler(req, res, next);

            expect(res._rendered).to.equal('site');
            expect(res._renderedData.sections).to.have.property('backstory');
            expect(res._renderedData.sections.backstory.content).to.equal('<p>Hello</p>');
            expect(res._renderedData.sectionsJson).to.be.a('string');
            expect(res._renderedData.sitActive).to.equal(1);
            expect(res._renderedData.editable).to.be.true;
        });

        it('should set editable=false for permission 0', async function () {
            var user = mockUser({ permission: 0 });
            var req = mockReq({ user: user, replacements: {} });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'get', '/');
            await handler(req, res, next);

            expect(res._renderedData.editable).to.be.false;
        });
    });

    describe('POST /:key', function () {

        it('should reject users with permission < 1', function () {
            var user = mockUser({ permission: 0 });
            var req = mockReq({
                user: user,
                params: { key: 'backstory' },
                body: { content: '<p>New</p>' },
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key');
            handler(req, res, next);

            expect(res.status.calledWith(403)).to.be.true;
            expect(req.flash.calledWith('error', sinon.match('permission'))).to.be.true;
        });

        it('should reject invalid section keys', function () {
            var user = mockUser({ permission: 1 });
            var req = mockReq({
                user: user,
                params: { key: 'invalid_section' },
                body: { content: 'test' },
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(req.flash.calledWith('error', sinon.match('Invalid'))).to.be.true;
        });

        it('should update existing section and return redirect', async function () {
            var existingSection = mockUser({}); // a stand-in plain object with $query
            existingSection.section_key = 'backstory';
            siteQb.resolves(existingSection);

            var user = mockUser({ permission: 1, email: 'editor@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'backstory' },
                body: { title: 'New Title', content: '<p>Updated</p>' },
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key');
            await handler(req, res, next);

            expect(existingSection._qb.patch.calledOnce).to.be.true;
            var patchArgs = existingSection._qb.patch.firstCall.args[0];
            expect(patchArgs).to.include({ title: 'New Title', content: '<p>Updated</p>', updated_by: 'editor@test.com' });
            expect(res._json.redirect).to.equal('/site');
        });

        it('should create new section if not found', async function () {
            siteQb.resolves(null);

            var user = mockUser({ permission: 2, email: 'admin@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'rest_help' },
                body: { title: 'API', content: '<p>API docs</p>' },
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key');
            await handler(req, res, next);

            expect(siteQb.insert.calledOnce).to.be.true;
            expect(res._json.redirect).to.equal('/site');
            expect(req.flash.calledWith('yay', sinon.match('updated'))).to.be.true;
        });
    });

    describe('POST /:key/reset', function () {

        it('should reject users with permission < 1', function () {
            var user = mockUser({ permission: 0 });
            var req = mockReq({
                user: user,
                params: { key: 'backstory' }
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key/reset');
            handler(req, res, next);

            expect(res.status.calledWith(403)).to.be.true;
            expect(fsStub.readFileSync.called).to.be.false;
        });

        it('should reject invalid section keys', function () {
            var user = mockUser({ permission: 1 });
            var req = mockReq({
                user: user,
                params: { key: 'not_a_section' }
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key/reset');
            handler(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(fsStub.readFileSync.called).to.be.false;
        });

        it('should read the partial file and write its content to the existing row', async function () {
            var existing = mockUser({});
            existing.section_key = 'backstory';
            siteQb.resolves(existing);

            var user = mockUser({ permission: 1, email: 'editor@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'backstory' }
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key/reset');
            await handler(req, res, next);

            expect(fsStub.readFileSync.calledOnce).to.be.true;
            expect(fsStub.readFileSync.firstCall.args[0]).to.match(/backstoryContents\.hbs$/);
            expect(existing._qb.patch.calledOnce).to.be.true;
            var patchArgs = existing._qb.patch.firstCall.args[0];
            expect(patchArgs.content).to.equal('<p>From file</p>');
            expect(patchArgs.updated_by).to.equal('editor@test.com');
            expect(res._json.content).to.equal('<p>From file</p>');
            expect(res._json.updated_by).to.equal('editor@test.com');
        });

        it('should insert a new row when the section does not exist', async function () {
            siteQb.resolves(null);

            var user = mockUser({ permission: 2, email: 'admin@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'search_help' }
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key/reset');
            await handler(req, res, next);

            expect(siteQb.insert.calledOnce).to.be.true;
            expect(res._json.content).to.equal('<p>From file</p>');
        });

        it('should 500 if the source file cannot be read', function () {
            fsStub.readFileSync.throws(new Error('ENOENT'));

            var user = mockUser({ permission: 1, email: 'editor@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'backstory' }
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key/reset');
            handler(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
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
