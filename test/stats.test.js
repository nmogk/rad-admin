var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var fakeStats = {
    labels: ['2025-05-18', '2026-05-17'],
    pageLoads: [1, 2],
    uniqueVisitors: [1, 2],
    queries: [0, 1],
    histogramBins: ['0', '1', '10+'],
    histogramCounts: [1, 0, 0],
    aggregatorTotal: 5,
    randomTotal: 3,
    recentQueries: [{ t: '2026-05-17T00:00:00.000Z', q: 'darwin' }]
};

var logStatsStub = {
    getStats: sinon.stub().resolves(fakeStats),
    clearCache: sinon.stub()
};

var statsRouter = proxyquire('../routes/stats', {
    '../server/log-stats': logStatsStub
});

describe('Stats Route', function () {

    beforeEach(function () {
        logStatsStub.getStats.resetHistory();
        logStatsStub.getStats.resolves(fakeStats);
    });

    it('renders the stats view with statActive=1 and serialised data', async function () {
        var user = mockUser({ permission: 0 });
        var req = mockReq({ user: user, replacements: {} });
        var res = mockRes();
        var next = sinon.spy();

        var handler = findHandler(statsRouter, 'get', '/');
        await handler(req, res, next);

        expect(res._rendered).to.equal('stats');
        expect(res._renderedData.statActive).to.equal(1);
        expect(res._renderedData.stats).to.equal(fakeStats);
        expect(res._renderedData.statsJson).to.be.a('string');
        expect(JSON.parse(res._renderedData.statsJson).aggregatorTotal).to.equal(5);
    });

    it('forwards errors to next() when the parser rejects', async function () {
        logStatsStub.getStats.rejects(new Error('disk on fire'));

        var user = mockUser({ permission: 0 });
        var req = mockReq({ user: user, replacements: {} });
        var res = mockRes();
        var next = sinon.spy();

        var handler = findHandler(statsRouter, 'get', '/');
        await handler(req, res, next);

        expect(next.calledOnce).to.be.true;
        expect(next.firstCall.args[0]).to.be.an('error');
        expect(res._rendered).to.be.null;
    });

    it('calls getStats once per request (memoisation lives in the parser module)', async function () {
        var user = mockUser({ permission: 0 });
        var req = mockReq({ user: user, replacements: {} });
        var res = mockRes();
        var next = sinon.spy();

        var handler = findHandler(statsRouter, 'get', '/');
        await handler(req, res, next);
        await handler(mockReq({ user: user, replacements: {} }), mockRes(), sinon.spy());

        expect(logStatsStub.getStats.callCount).to.equal(2);
    });
});

function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route && l.route.path === path && l.route.methods[method];
    });
    if (!layer) throw new Error('No handler for ' + method.toUpperCase() + ' ' + path);
    return layer.route.stack[0].handle;
}
