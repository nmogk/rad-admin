var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser, mockQueryBuilder } = require('./helpers');

// Campaign stub:
//   - Campaign.query()                                    listing endpoints
//   - Campaign.query().insertAndFetch({...})              POST /new
//   - Campaign.query().findById(id).throwIfNotFound()     POST /:id, DELETE /:id, refs ops
//   - campaign.$query().patch({...}) / .delete()          mutations on the fetched row

var campaignQb;
var fetchedCampaign;

function makeCampaign(initial) {
    var data = Object.assign({ id: 1, name: 'C', description: '', refs: [] }, initial || {});
    var qb = mockQueryBuilder();
    data.$query = sinon.stub().returns(qb);
    data._qb = qb;
    return data;
}

var CampaignStub = { query: sinon.stub() };
CampaignStub.NotFoundError = class NotFoundError extends Error {};

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
        campaignQb = mockQueryBuilder();
        fetchedCampaign = makeCampaign();
        CampaignStub.query.reset();
        CampaignStub.query.returns(campaignQb);
        auditLoggerStub.info.reset();
    });

    describe('GET /', function () {
        it('renders campaigns view with campaigns list', async function () {
            campaignQb.resolves([{ id: 1, name: 'A', description: 'desc', refs: [10, 20] }]);
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
            campaignQb.resolves([
                { id: 1, name: 'A', refs: [1, 2, 3] },
                { id: 2, name: 'B', refs: [] }
            ]);
            var req = mockReq({ user: mockUser() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'get', '/list.json');
            await handler(req, res, sinon.spy());

            expect(res._json).to.deep.equal([
                { id: 1, name: 'A', refCount: 3 },
                { id: 2, name: 'B', refCount: 0 }
            ]);
        });

        it('orders by updated_at desc then id desc (#165)', async function () {
            campaignQb.resolves([]);
            var req = mockReq({ user: mockUser() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'get', '/list.json');
            await handler(req, res, sinon.spy());

            // Both orderBy calls on the same builder; assert their args.
            var orderCalls = campaignQb.orderBy.getCalls().map(function (c) { return c.args; });
            expect(orderCalls).to.deep.equal([
                ['updated_at', 'desc'],
                ['id', 'desc']
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
            campaignQb.insertAndFetch.resolves({ id: 99, name: 'Fix dates' });
            var req = mockReq({ method: 'POST', body: { name: 'Fix dates', description: 'normalise YYYY' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            expect(res._json.redirect).to.equal('/campaigns');
            expect(auditLoggerStub.info.calledOnce).to.be.true;
            expect(auditLoggerStub.info.firstCall.args[0]).to.include('created a new campaign');
        });

        it('returns the saved campaign id/name for inline create flows', async function () {
            campaignQb.insertAndFetch.resolves({ id: 99, name: 'Fix dates' });
            var req = mockReq({ method: 'POST', body: { name: 'Fix dates' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            expect(res._json.campaign).to.deep.equal({ id: 99, name: 'Fix dates', refCount: 0 });
        });

        it('does not set updated_at in the insert payload — MySQL DEFAULT handles it (#165)', async function () {
            campaignQb.insertAndFetch.resolves({ id: 99, name: 'Fresh' });
            var req = mockReq({ method: 'POST', body: { name: 'Fresh' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/new');
            await handler(req, res, sinon.spy());

            expect(campaignQb.insertAndFetch.calledOnce).to.be.true;
            var args = campaignQb.insertAndFetch.firstCall.args[0];
            expect(args).to.not.have.property('updated_at');
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
            fetchedCampaign = makeCampaign({ id: 5, name: 'Old', description: 'Old desc', refs: [1, 2, 3] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { name: 'New', description: 'New desc' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.patch.calledOnce).to.be.true;
            var patchArgs = fetchedCampaign._qb.patch.firstCall.args[0];
            expect(patchArgs).to.have.property('name', 'New');
            expect(patchArgs).to.have.property('description', 'New desc');
            expect(patchArgs).to.not.have.property('refs');
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
            fetchedCampaign = makeCampaign({ id: 5, refs: [1, 2, 3] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: {}, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(res.status.calledWith(409)).to.be.true;
            expect(res._json.refCount).to.equal(3);
            expect(fetchedCampaign._qb.delete.called).to.be.false;
        });

        it('deletes when refs present but force=1', async function () {
            fetchedCampaign = makeCampaign({ id: 5, refs: [1, 2] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: { force: '1' }, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.delete.calledOnce).to.be.true;
            expect(res._json.redirect).to.equal('/campaigns');
        });

        it('deletes empty campaign on first try', async function () {
            fetchedCampaign = makeCampaign({ id: 5, refs: [] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: {}, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.delete.calledOnce).to.be.true;
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
            fetchedCampaign = makeCampaign({ id: 5, refs: [10, 20] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { ids: [20, 30, 40] }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.patch.calledOnce).to.be.true;
            var patchArgs = fetchedCampaign._qb.patch.firstCall.args[0];
            expect(patchArgs.refs).to.deep.equal([10, 20, 30, 40]);
            expect(res._json.added).to.equal(2);
            expect(res._json.refCount).to.equal(4);
        });

        it('accepts a single id via body.id', async function () {
            fetchedCampaign = makeCampaign({ id: 5, refs: [] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { id: 42 }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(res._json.added).to.equal(1);
            expect(res._json.refCount).to.equal(1);
        });

        it('does not patch when every id is a duplicate so MySQL ON UPDATE does not shuffle the picker (#165)', async function () {
            // With ON UPDATE CURRENT_TIMESTAMP, even a patch({refs: existing})
            // would bump updated_at on a no-op write. Skip the patch (and the
            // audit-log noise) when nothing actually changed.
            fetchedCampaign = makeCampaign({ id: 5, refs: [10, 20] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { ids: [10, 20] }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'post', '/:id(\\d+)/refs');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.patch.called).to.be.false;
            expect(auditLoggerStub.info.called).to.be.false;
            expect(res._json.added).to.equal(0);
            expect(res._json.refCount).to.equal(2);
        });

        it('writes audit log with the added IDs', async function () {
            fetchedCampaign = makeCampaign({ id: 5, refs: [] });
            campaignQb.resolves(fetchedCampaign);
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
            fetchedCampaign = makeCampaign({ id: 5, refs: [10, 20, 30] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'DELETE', params: { id: '5', refId: '20' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)/refs/:refId(\\d+)');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.patch.calledOnce).to.be.true;
            expect(res._json.removed).to.equal(1);
            expect(res._json.refCount).to.equal(2);
        });

        it('is a no-op when ID not present (still 200)', async function () {
            fetchedCampaign = makeCampaign({ id: 5, refs: [10, 20] });
            campaignQb.resolves(fetchedCampaign);
            var req = mockReq({ method: 'DELETE', params: { id: '5', refId: '999' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(campaignsRouter, 'delete', '/:id(\\d+)/refs/:refId(\\d+)');
            await handler(req, res, sinon.spy());

            expect(fetchedCampaign._qb.patch.called).to.be.false;
            expect(res._json.removed).to.equal(0);
            expect(res._json.refCount).to.equal(2);
        });
    });
});
