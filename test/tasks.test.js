var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser, mockQueryBuilder } = require('./helpers');

// Stubs for the three models. Each gets:
//   Model.query()                                    chainable QB
//   Model.query().findById(id).throwIfNotFound()     fetch single row
//   Model.NotFoundError                              error class for 404 paths

function makeRow(initial) {
    var qb = mockQueryBuilder();
    var row = Object.assign({}, initial || {});
    row.$query = sinon.stub().returns(qb);
    row._qb = qb;
    return row;
}

var PeriodicalStub = { query: sinon.stub() };
PeriodicalStub.NotFoundError = class NotFoundError extends Error {};

var IssueTodoStub = { query: sinon.stub() };
IssueTodoStub.NotFoundError = class NotFoundError extends Error {};

var GeneralTodoStub = { query: sinon.stub() };
GeneralTodoStub.NotFoundError = class NotFoundError extends Error {};

var UserStub = { query: sinon.stub() };
UserStub.NotFoundError = class NotFoundError extends Error {};

var auditLoggerStub = { info: sinon.stub() };
var log4jsStub = { getLogger: sinon.stub().returns(auditLoggerStub) };

var tasksRouter = proxyquire('../routes/tasks', {
    '../models/periodical': PeriodicalStub,
    '../models/issue-todo': IssueTodoStub,
    '../models/general-todo': GeneralTodoStub,
    '../models/user': UserStub,
    'log4js': log4jsStub
});

function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route && l.route.path === path && l.route.methods[method];
    });
    if (!layer) { throw new Error('No handler for ' + method.toUpperCase() + ' ' + path); }
    return layer.route.stack[0].handle;
}

describe('Tasks Routes', function () {

    var pQb, iQb, gQb, uQb;

    beforeEach(function () {
        pQb = mockQueryBuilder(); iQb = mockQueryBuilder(); gQb = mockQueryBuilder(); uQb = mockQueryBuilder();
        PeriodicalStub.query.reset(); PeriodicalStub.query.returns(pQb);
        IssueTodoStub.query.reset(); IssueTodoStub.query.returns(iQb);
        GeneralTodoStub.query.reset(); GeneralTodoStub.query.returns(gQb);
        UserStub.query.reset(); UserStub.query.returns(uQb);
        auditLoggerStub.info.reset();
    });

    describe('GET /', function () {
        it('renders tasks view, sorts periodicals (outstanding first, then by max updated_at)', async function () {
            var older = '2025-01-01T00:00:00Z';
            var newer = '2025-06-01T00:00:00Z';
            var newest = '2025-12-01T00:00:00Z';
            var periodicals = [
                { id: 1, name: 'A', publisher_name: 'P1', updated_at: older,
                  issues: [{ id: 11, completed: 1, updated_at: older, editor: null }] },
                { id: 2, name: 'B', publisher_name: 'P2', updated_at: newer,
                  issues: [{ id: 21, completed: 0, updated_at: newer, editor: null }] },
                { id: 3, name: 'C', publisher_name: 'P3', updated_at: older,
                  issues: [{ id: 31, completed: 0, updated_at: newest, editor: null }] }
            ];
            // Two distinct query chains: periodicals first, then generals.
            var pQb1 = mockQueryBuilder(); pQb1.resolves(periodicals);
            var gQb1 = mockQueryBuilder(); gQb1.resolves([]);
            gQb1.orderBy = sinon.stub().returns(gQb1);
            PeriodicalStub.query.returns(pQb1);
            GeneralTodoStub.query.returns(gQb1);

            var req = mockReq({ user: mockUser(), replacements: {} });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'get', '/');
            await handler(req, res, sinon.spy());

            expect(res._rendered).to.equal('tasks');
            var rendered = res._renderedData.periodicals;
            // Outstanding (B, C) should come before fully-completed (A);
            // among outstanding, C (max updated_at = newest) ahead of B.
            expect(rendered.map(function (p) { return p.name; })).to.deep.equal(['C', 'B', 'A']);
            expect(res._renderedData.tskActive).to.equal(1);
        });
    });

    describe('GET /users.json', function () {
        it('rejects permission < 1', async function () {
            var req = mockReq({ user: mockUser({ permission: 0 }) });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'get', '/users.json');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(403)).to.be.true;
        });

        it('returns id+name for delete-perm caller', async function () {
            uQb.orderBy = sinon.stub().returns(uQb);
            uQb.select = sinon.stub().returns(uQb);
            uQb.resolves([{ id: 1, name: 'Alice', email: 'a@x' }, { id: 2, name: null, email: 'b@x' }]);
            var req = mockReq({ user: mockUser({ permission: 1 }) });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'get', '/users.json');
            await handler(req, res, sinon.spy());
            expect(res._json).to.deep.equal([{ id: 1, name: 'Alice' }, { id: 2, name: 'b@x' }]);
        });
    });

    // ---------- Periodicals ----------

    describe('POST /periodicals/new', function () {
        it('rejects empty name', async function () {
            var req = mockReq({ method: 'POST', body: { publisher_name: 'P' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/periodicals/new');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(400)).to.be.true;
        });

        it('rejects empty publisher', async function () {
            var req = mockReq({ method: 'POST', body: { name: 'N' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/periodicals/new');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(400)).to.be.true;
        });

        it('saves and returns redirect+periodical', async function () {
            pQb.insertAndFetch.resolves({ id: 7, name: 'N', publisher_name: 'P' });
            var req = mockReq({ method: 'POST', body: { name: 'N', publisher_name: 'P' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/periodicals/new');
            await handler(req, res, sinon.spy());
            expect(res._json.redirect).to.equal('/tasks');
            expect(res._json.periodical).to.deep.equal({ id: 7, name: 'N', publisher_name: 'P' });
            expect(auditLoggerStub.info.firstCall.args[0]).to.include('created periodical');
        });
    });

    describe('DELETE /periodicals/:id', function () {
        it('rejects permission < 1', async function () {
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, user: mockUser({ permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'delete', '/periodicals/:id(\\d+)');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(403)).to.be.true;
        });

        it('returns 409 when issues attached and no force', async function () {
            var p = makeRow({ id: 5, name: 'N', issues: [{ id: 1 }, { id: 2 }] });
            pQb.resolves(p);
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: {}, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'delete', '/periodicals/:id(\\d+)');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(409)).to.be.true;
            expect(res._json.issueCount).to.equal(2);
            expect(p._qb.delete.called).to.be.false;
        });

        it('cascades issue deletion when force=1', async function () {
            var p = makeRow({ id: 5, name: 'N', issues: [{ id: 1 }] });
            pQb.resolves(p);
            // Cascade delete uses IssueTodo.query().delete().where(...).
            iQb.delete = sinon.stub().returns(iQb);
            iQb.where = sinon.stub().resolves(1);
            var req = mockReq({ method: 'DELETE', params: { id: '5' }, query: { force: '1' }, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'delete', '/periodicals/:id(\\d+)');
            await handler(req, res, sinon.spy());
            expect(iQb.delete.calledOnce).to.be.true;
            expect(p._qb.delete.calledOnce).to.be.true;
            expect(res._json.redirect).to.equal('/tasks');
        });
    });

    // ---------- Issues ----------

    describe('POST /periodicals/:id/issues/new', function () {
        it('rejects malformed date', async function () {
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { dt: 'tomorrow' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/periodicals/:id(\\d+)/issues/new');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(400)).to.be.true;
        });

        it('accepts year-only ISO date and inserts under the periodical', async function () {
            pQb.resolves({ id: 5 });
            iQb.insertAndFetch.resolves({ id: 99, periodical_id: 5, volume: '1', dt: '2025', completed: 0 });
            var req = mockReq({ method: 'POST', params: { id: '5' }, body: { volume: '1', dt: '2025' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/periodicals/:id(\\d+)/issues/new');
            await handler(req, res, sinon.spy());
            expect(iQb.insertAndFetch.calledOnce).to.be.true;
            expect(res._json.issue).to.include({ id: 99, periodical_id: 5 });
        });
    });

    describe('POST /issues/:id/claim', function () {
        it('sets editor_id to current user', async function () {
            var issue = makeRow({ id: 7 });
            iQb.resolves(issue);
            var req = mockReq({ method: 'POST', params: { id: '7' }, user: mockUser({ id: 42, name: 'Bob' }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/claim');
            await handler(req, res, sinon.spy());
            expect(issue._qb.patch.calledWith({ editor_id: 42 })).to.be.true;
            expect(res._json.editor).to.deep.equal({ id: 42, name: 'Bob' });
        });
    });

    describe('POST /issues/:id/release', function () {
        it('lets the assignee release', async function () {
            var issue = makeRow({ id: 7, editor_id: 42 });
            iQb.resolves(issue);
            var req = mockReq({ method: 'POST', params: { id: '7' }, user: mockUser({ id: 42, permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/release');
            await handler(req, res, sinon.spy());
            expect(issue._qb.patch.calledWith({ editor_id: null })).to.be.true;
            expect(res._json.editor).to.equal(null);
        });

        it('rejects another non-delete user from releasing', async function () {
            var issue = makeRow({ id: 7, editor_id: 42 });
            iQb.resolves(issue);
            var req = mockReq({ method: 'POST', params: { id: '7' }, user: mockUser({ id: 99, permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/release');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(403)).to.be.true;
            expect(issue._qb.patch.called).to.be.false;
        });

        it('lets a delete-perm user release another user', async function () {
            var issue = makeRow({ id: 7, editor_id: 42 });
            iQb.resolves(issue);
            var req = mockReq({ method: 'POST', params: { id: '7' }, user: mockUser({ id: 99, permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/release');
            await handler(req, res, sinon.spy());
            expect(issue._qb.patch.calledOnce).to.be.true;
        });
    });

    describe('POST /issues/:id/assign', function () {
        it('rejects permission < 1', async function () {
            var req = mockReq({ method: 'POST', params: { id: '7' }, body: { editor_id: 5 }, user: mockUser({ permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/assign');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(403)).to.be.true;
        });

        it('assigns when editor exists', async function () {
            var issue = makeRow({ id: 7 });
            iQb.resolves(issue);
            uQb.resolves({ id: 5, name: 'Carol', email: 'c@x' });
            var req = mockReq({ method: 'POST', params: { id: '7' }, body: { editor_id: '5' }, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/assign');
            await handler(req, res, sinon.spy());
            expect(issue._qb.patch.calledWith({ editor_id: 5 })).to.be.true;
            expect(res._json.editor).to.deep.equal({ id: 5, name: 'Carol' });
        });
    });

    describe('POST /issues/:id/complete', function () {
        it('toggles completed flag', async function () {
            var issue = makeRow({ id: 7 });
            iQb.resolves(issue);
            var req = mockReq({ method: 'POST', params: { id: '7' }, body: { completed: true }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/issues/:id(\\d+)/complete');
            await handler(req, res, sinon.spy());
            expect(issue._qb.patch.calledWith({ completed: 1 })).to.be.true;
            expect(res._json.completed).to.equal(true);
        });
    });

    describe('DELETE /issues/:id', function () {
        it('rejects permission < 1', async function () {
            var req = mockReq({ method: 'DELETE', params: { id: '7' }, user: mockUser({ permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'delete', '/issues/:id(\\d+)');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(403)).to.be.true;
        });

        it('deletes when delete-perm', async function () {
            var issue = makeRow({ id: 7, periodical_id: 1 });
            iQb.resolves(issue);
            var req = mockReq({ method: 'DELETE', params: { id: '7' }, user: mockUser({ permission: 1 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'delete', '/issues/:id(\\d+)');
            await handler(req, res, sinon.spy());
            expect(issue._qb.delete.calledOnce).to.be.true;
            expect(res._json.deleted).to.equal(true);
        });
    });

    // ---------- General TODOs ----------

    describe('POST /general/new', function () {
        it('rejects empty description', async function () {
            var req = mockReq({ method: 'POST', body: {}, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/general/new');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(400)).to.be.true;
        });

        it('rejects malformed date', async function () {
            var req = mockReq({ method: 'POST', body: { description: 'work', dt: 'soon' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/general/new');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(400)).to.be.true;
        });

        it('saves on valid input', async function () {
            gQb.insertAndFetch.resolves({ id: 8, description: 'work', dt: '2025-06', completed: 0 });
            var req = mockReq({ method: 'POST', body: { description: 'work', dt: '2025-06' }, user: mockUser(), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'post', '/general/new');
            await handler(req, res, sinon.spy());
            expect(res._json.todo).to.include({ id: 8, description: 'work' });
        });
    });

    describe('DELETE /general/:id', function () {
        it('rejects permission < 1', async function () {
            var req = mockReq({ method: 'DELETE', params: { id: '8' }, user: mockUser({ permission: 0 }), flash: sinon.stub() });
            var res = mockRes();
            var handler = findHandler(tasksRouter, 'delete', '/general/:id(\\d+)');
            await handler(req, res, sinon.spy());
            expect(res.status.calledWith(403)).to.be.true;
        });
    });
});
