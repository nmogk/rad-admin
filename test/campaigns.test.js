var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

// ---- Campaign stub ----
// The route does three things with the model:
//   - new Campaign({name, description, refs:[]}).save()       (POST /new)
//   - new Campaign({id}).fetch()                              (POST /:id, DELETE /:id, /refs ops)
//   - Campaign.fetchAll()                                     (GET /, GET /list.json)
// Tests configure `fetchedCampaign` with whatever .get/.set/.save/.destroy
// behaviour they need, and `savedNewCampaign` for the create path.

var fetchedCampaign;
var savedNewCampaign;
var saveStub;
var destroyStub;
var fetchStub;
var fetchAllStub;

function buildFetchedCampaign(initial) {
    var data = Object.assign({ id: 1, name: 'C', description: '', refs: [] }, initial || {});
    saveStub = sinon.stub().resolves();
    destroyStub = sinon.stub().resolves();
    return {
        get: sinon.stub().callsFake(function (k) { return data[k]; }),
        set: sinon.stub().callsFake(function (k, v) {
            if (typeof k === 'object') { Object.assign(data, k); }
            else { data[k] = v; }
        }),
        save: saveStub,
        destroy: destroyStub
    };
}

var CampaignStub = function (attrs) {
    if (attrs && (attrs.name !== undefined) && attrs.refs !== undefined) {
        // create path
        savedNewCampaign = {
            get: sinon.stub().callsFake(function (k) {
                if (k === 'id') { return 99; }
                return attrs[k];
            })
        };
        return { save: sinon.stub().resolves(savedNewCampaign) };
    }
    // load-by-id path
    fetchStub = sinon.stub().resolves(fetchedCampaign);
    return { fetch: fetchStub };
};
CampaignStub.fetchAll = function () { return fetchAllStub(); };

var auditLoggerStub = { info: sinon.stub() };
var log4jsStub = { getLogger: sinon.stub().returns(auditLoggerStub) };

var campaignsRouter = proxyquire('../routes/campaigns', {
    '../models/campaign': CampaignStub,
    'log4js': log4jsStub
});

function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route && l.route.path === path && l.route.methods[method];
    });
    if (!layer) { throw new Error('No handler found for ' + method.toUpperCase() + ' ' + path); }
    return layer.route.stack[0].handle;
}

describe('Campaigns Routes', function () {

    beforeEach(function () {
        fetchedCampaign = buildFetchedCampaign();
        savedNewCampaign = null;
        fetchAllStub = sinon.stub().resolves({ models: [] });
        auditLoggerStub.info.reset();
    });

    describe('GET /', function () {
        it('renders campaigns view with campaigns list', async function () {
            fetchAllStub = sinon.stub().resolves({
                models: [
                    { get: sinon.stub().callsFake(function (k) { return ({id: 1, name: 'A', description: 'desc', refs: [10, 20]})[k]; }) }
                ]
            });
            var req = mockReq({ user: mockUser(), replacements: {} });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'get', '/');
            await handler(req, res, sinon.spy());

            expect(res._rendered).to.equal('campaigns');
            expect(res._renderedData.campaigns).to.have.lengthOf(1);
            expect(res._renderedData.campaigns[0]).to.deep.include({ id: 1, name: 'A', description: 'desc' });
            expect(res._renderedData.campaigns[0].refs).to.deep.equal([10, 20]);
            expect(res._renderedData.cmpActive).to.equal(1);
        });
    });

    describe('GET /list.json', function () {
        it('returns lightweight {id, name, refCount}', async function () {
            fetchAllStub = sinon.stub().resolves({
                models: [
                    { get: sinon.stub().callsFake(function (k) { return ({id: 1, name: 'A', refs: [1,2,3]})[k]; }) },
                    { get: sinon.stub().callsFake(function (k) { return ({id: 2, name: 'B', refs: []})[k]; }) }
                ]
            });
            var req = mockReq({ user: mockUser() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'get', '/list.json');
            await handler(req, res, sinon.spy());

            expect(res._json).to.deep.equal([
                { id: 1, name: 'A', refCount: 3 },
                { id: 2, name: 'B', refCount: 0 }
            ]);
        });
    });

    describe('POST /new', function () {
        it('rejects empty name', async function () {
            var req = mockReq({ method: 'POST', body: {}, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('rejects whitespace-only name', async function () {
            var req = mockReq({ method: 'POST', body: { name: '   ' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('saves and redirects on success', async function () {
            var req = mockReq({ method: 'POST', body: { name: 'Fix dates', description: 'normalise YYYY' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            expect(res._json.redirect).to.equal('/campaigns');
            expect(auditLoggerStub.info.calledOnce).to.be.true;
            expect(auditLoggerStub.info.firstCall.args[0]).to.include('created a new campaign');
        });
    });

    describe('POST /:id (edit)', function () {
        it('rejects empty name', async function () {
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: {}, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('updates name/description without touching refs', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, name: 'Old', description: 'Old desc', refs: [1, 2, 3] });
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { name: 'New', description: 'New desc' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(saveStub.calledOnce).to.be.true;
            expect(fetchedCampaign.set.calledOnce).to.be.true;
            var setArgs = fetchedCampaign.set.firstCall.args[0];
            expect(setArgs).to.have.property('name', 'New');
            expect(setArgs).to.have.property('description', 'New desc');
            expect(setArgs).to.not.have.property('refs');
            expect(res._json.redirect).to.equal('/campaigns');
        });
    });

    describe('DELETE /:id', function () {
        it('rejects users with permission < 1', async function () {
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, user: mockUser({ permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(403)).to.be.true;
        });

        it('returns 409 with refCount when refs present and force not set', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [1, 2, 3] });
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: {}, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(409)).to.be.true;
            expect(res._json.refCount).to.equal(3);
            expect(destroyStub.called).to.be.false;
        });

        it('deletes when refs present but force=1', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [1, 2] });
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: { force: '1' }, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(destroyStub.calledOnce).to.be.true;
            expect(res._json.redirect).to.equal('/campaigns');
        });

        it('deletes empty campaign on first try', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [] });
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: {}, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(destroyStub.calledOnce).to.be.true;
            expect(auditLoggerStub.info.firstCall.args[0]).to.include('deleted campaign');
        });
    });

    describe('POST /:id/refs', function () {
        it('rejects when no valid IDs provided', async function () {
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { ids: [] }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('appends new IDs and de-dups against existing', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [10, 20] });
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { ids: [20, 30, 40] }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(saveStub.calledOnce).to.be.true;
            // Final state: [10, 20, 30, 40] — 30 and 40 added, 20 already present.
            var setCalls = fetchedCampaign.set.getCalls();
            var finalRefs = setCalls[setCalls.length - 1].args[1] || setCalls[setCalls.length - 1].args[0].refs;
            expect(finalRefs).to.deep.equal([10, 20, 30, 40]);
            expect(res._json.added).to.equal(2);
            expect(res._json.refCount).to.equal(4);
        });

        it('accepts a single id via body.id', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [] });
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { id: 42 }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(res._json.added).to.equal(1);
            expect(res._json.refCount).to.equal(1);
        });

        it('writes audit log with the added IDs', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [] });
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { ids: [1, 2] }, user: mockUser({ email: 'editor@test.com' }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(auditLoggerStub.info.calledOnce).to.be.true;
            var msg = auditLoggerStub.info.firstCall.args[0];
            expect(msg).to.include('editor@test.com');
            expect(msg).to.include('added refs');
            expect(msg).to.include('[1,2]');
        });
    });

    describe('DELETE /:id/refs/:refId', function () {
        it('removes the ref ID and reports counts', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [10, 20, 30] });
            var req = mockReq({ method: 'DELETE', params: { id: '5', refId: '20' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)/refs/:refId(\\d+)');
            await handler(req, res, sinon.spy());

            expect(saveStub.calledOnce).to.be.true;
            expect(res._json.removed).to.equal(1);
            expect(res._json.refCount).to.equal(2);
        });

        it('is a no-op when ID not present (still 200)', async function () {
            fetchedCampaign = buildFetchedCampaign({ id: 5, refs: [10, 20] });
            var req = mockReq({ method: 'DELETE', params: { id: '5', refId: '999' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)/refs/:refId(\\d+)');
            await handler(req, res, sinon.spy());

            expect(saveStub.called).to.be.false;
            expect(res._json.removed).to.equal(0);
            expect(res._json.refCount).to.equal(2);
        });
    });
});
