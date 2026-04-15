var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var fakeSections = [
    { section_key: 'backstory', title: 'Story', content: '<p>Hello</p>', updated_at: '2026-04-10T12:00:00Z', updated_by: 'admin@test.com' },
    { section_key: 'search_help', title: 'Help', content: '<p>Search</p>', updated_at: null, updated_by: null }
];

var sectionModels = fakeSections.map(function (s) {
    return {
        get: function (key) { return s[key]; }
    };
});

var fetchAllStub = sinon.stub().resolves({ models: sectionModels });
var fetchStub = sinon.stub();
var saveStub = sinon.stub().resolves();

var SiteContentStub = function (attrs) {
    return {
        attrs: attrs,
        fetch: fetchStub,
        save: saveStub,
        set: sinon.stub(),
        get: function (key) { return attrs[key]; }
    };
};
SiteContentStub.fetchAll = fetchAllStub;

var log4jsStub = {
    getLogger: sinon.stub().returns({
        info: sinon.stub()
    })
};

var siteRouter = proxyquire('../routes/site', {
    '../models/site-content': SiteContentStub,
    'log4js': log4jsStub
});

describe('Site Routes', function () {

    beforeEach(function () {
        fetchAllStub.resolves({ models: sectionModels });
        fetchStub.reset();
        saveStub.reset();
    });

    describe('GET /', function () {

        it('should render site view with sections data', function (done) {
            var user = mockUser({ permission: 1 });
            var req = mockReq({ user: user, replacements: {} });
            var res = mockRes();
            res.render = sinon.stub().callsFake(function (view, data) {
                expect(view).to.equal('site');
                expect(data.sections).to.have.property('backstory');
                expect(data.sections.backstory.content).to.equal('<p>Hello</p>');
                expect(data.sectionsJson).to.be.a('string');
                expect(data.sitActive).to.equal(1);
                expect(data.editable).to.be.true;
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'get', '/');
            handler(req, res, next);
        });

        it('should set editable=false for permission 0', function (done) {
            var user = mockUser({ permission: 0 });
            var req = mockReq({ user: user, replacements: {} });
            var res = mockRes();
            res.render = sinon.stub().callsFake(function (view, data) {
                expect(data.editable).to.be.false;
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'get', '/');
            handler(req, res, next);
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

        it('should update existing section and return redirect', function (done) {
            var existingSection = {
                set: sinon.stub(),
                save: sinon.stub().resolves(),
                get: function (key) { return 'backstory'; }
            };
            fetchStub.resolves(existingSection);

            var user = mockUser({ permission: 1, email: 'editor@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'backstory' },
                body: { title: 'New Title', content: '<p>Updated</p>' },
                flash: sinon.stub()
            });
            var res = mockRes();
            res.json = sinon.stub().callsFake(function (data) {
                expect(existingSection.set.calledWith('content', '<p>Updated</p>')).to.be.true;
                expect(existingSection.set.calledWith('title', 'New Title')).to.be.true;
                expect(existingSection.save.calledOnce).to.be.true;
                expect(data.redirect).to.equal('/site');
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key');
            handler(req, res, next);
        });

        it('should create new section if not found', function (done) {
            fetchStub.resolves(null);

            var user = mockUser({ permission: 2, email: 'admin@test.com' });
            var req = mockReq({
                user: user,
                params: { key: 'rest_help' },
                body: { title: 'API', content: '<p>API docs</p>' },
                flash: sinon.stub()
            });
            var res = mockRes();
            res.json = sinon.stub().callsFake(function (data) {
                expect(data.redirect).to.equal('/site');
                expect(req.flash.calledWith('yay', sinon.match('updated'))).to.be.true;
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(siteRouter, 'post', '/:key');
            handler(req, res, next);
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
