var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var SiteContentStub = { all: sinon.stub() };

var fsStub = {
    readFileSync: sinon.stub().returns(JSON.stringify({
        numRecords: 1234,
        highestId: 9999,
        latest: '2026-04-10',
        updated: '2026-05-01'
    }))
};

var indexRouter = proxyquire('../routes/index', {
    '../models/site-content': SiteContentStub,
    'fs': fsStub
});

function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route && l.route.path === path && l.route.methods[method];
    });
    if (!layer) { throw new Error('No handler found for ' + method.toUpperCase() + ' ' + path); }
    return layer.route.stack[0].handle;
}

describe('Index Route', function () {

    beforeEach(function () {
        SiteContentStub.all.reset();
        SiteContentStub.all.resolves([]);
        fsStub.readFileSync.resetHistory();
        fsStub.readFileSync.returns(JSON.stringify({
            numRecords: 1234, highestId: 9999, latest: '2026-04-10', updated: '2026-05-01'
        }));
    });

    describe('GET / randomSeed forwarding', function () {

        it('forwards ?seed=foo to the template as randomSeed', async function () {
            var req = mockReq({ query: { seed: 'foo' }, user: mockUser(), replacements: {} });
            var res = mockRes();
            var handler = findHandler(indexRouter, 'get', '/');
            await handler(req, res, sinon.spy());

            expect(res._rendered).to.equal('index');
            expect(res._renderedData.randomSeed).to.equal('foo');
        });

        it('passes randomSeed: null when no seed param is present', async function () {
            var req = mockReq({ query: {}, user: mockUser(), replacements: {} });
            var res = mockRes();
            var handler = findHandler(indexRouter, 'get', '/');
            await handler(req, res, sinon.spy());

            expect(res._renderedData.randomSeed).to.be.null;
        });

        it('coerces array-valued seed to null (defends against ?seed=a&seed=b)', async function () {
            var req = mockReq({ query: { seed: ['a', 'b'] }, user: mockUser(), replacements: {} });
            var res = mockRes();
            var handler = findHandler(indexRouter, 'get', '/');
            await handler(req, res, sinon.spy());

            expect(res._renderedData.randomSeed).to.be.null;
        });
    });
});
