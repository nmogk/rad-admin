var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var fsPromisesStub = {
    readdir: sinon.stub(),
    stat: sinon.stub(),
    mkdir: sinon.stub(),
    writeFile: sinon.stub(),
    unlink: sinon.stub()
};
var fsStub = { promises: fsPromisesStub };

var backupStub = { exportCore: sinon.stub() };
var statsStub = { scanCore: sinon.stub() };
var dbStub = { replaceStats: sinon.stub() };

var auditLoggerStub = { info: sinon.stub() };
var log4jsStub = { getLogger: sinon.stub().returns(auditLoggerStub) };

var dbRouter = proxyquire('../routes/database', {
    'fs': fsStub,
    '../server/solr-backup': backupStub,
    '../server/solr-stats': statsStub,
    '../server/database-json': dbStub,
    'log4js': log4jsStub
});

function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route && l.route.path === path && l.route.methods[method];
    });
    if (!layer) throw new Error('No handler for ' + method + ' ' + path);
    return layer.route.stack[0].handle;
}

describe('Database Routes', function () {

    beforeEach(function () {
        fsPromisesStub.readdir.reset();
        fsPromisesStub.stat.reset();
        fsPromisesStub.mkdir.reset();
        fsPromisesStub.writeFile.reset();
        fsPromisesStub.unlink.reset();
        backupStub.exportCore.reset();
        statsStub.scanCore.reset();
        dbStub.replaceStats.reset();
        auditLoggerStub.info.reset();
        fsPromisesStub.mkdir.resolves();
        fsPromisesStub.writeFile.resolves();
        fsPromisesStub.unlink.resolves();
    });

    describe('GET /', function () {
        it('lists existing backups sorted newest-first with formatted sizes', async function () {
            fsPromisesStub.readdir.resolves([
                'rad-20260101-120000.json',
                'source-20260201-090000.json',
                'random-other-file.txt'  // should be filtered out
            ]);
            fsPromisesStub.stat.callsFake(function (p) {
                if (p.indexOf('rad-20260101') !== -1) {
                    return Promise.resolve({ size: 2048, mtime: new Date('2026-01-01T12:00:00Z') });
                }
                return Promise.resolve({ size: 1024 * 1024 * 3, mtime: new Date('2026-02-01T09:00:00Z') });
            });

            var req = mockReq({ replacements: {}, user: mockUser({ permission: 2 }) });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'get', '/')(req, res, next);

            expect(res._rendered).to.equal('database');
            expect(req.replacements.dbActive).to.equal(1);
            var rows = req.replacements.backups;
            expect(rows).to.have.length(2);
            expect(rows[0].name).to.equal('source-20260201-090000.json');
            expect(rows[0].core).to.equal('source');
            expect(rows[0].sizeFormatted).to.equal('3.0 MB');
            expect(rows[1].name).to.equal('rad-20260101-120000.json');
            expect(rows[1].core).to.equal('rad');
            expect(rows[1].sizeFormatted).to.equal('2.0 KB');
        });

        it('renders an empty list when the backup dir does not exist', async function () {
            var enoent = new Error('not found');
            enoent.code = 'ENOENT';
            fsPromisesStub.readdir.rejects(enoent);

            var req = mockReq({ replacements: {}, user: mockUser({ permission: 2 }) });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'get', '/')(req, res, next);

            expect(res._rendered).to.equal('database');
            expect(req.replacements.backups).to.deep.equal([]);
            expect(next.called).to.be.false;
        });

        it('forwards non-ENOENT errors to next()', async function () {
            fsPromisesStub.readdir.rejects(new Error('disk on fire'));

            var req = mockReq({ replacements: {}, user: mockUser({ permission: 2 }) });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'get', '/')(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(next.firstCall.args[0].message).to.equal('disk on fire');
        });
    });

    describe('POST /backup', function () {
        it('creates a single backup for core=rad', async function () {
            backupStub.exportCore.resolves(Buffer.from('[]', 'utf8'));

            var req = mockReq({
                method: 'POST',
                body: { core: 'rad' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/backup')(req, res, next);

            expect(backupStub.exportCore.calledOnceWith('rad')).to.be.true;
            expect(fsPromisesStub.writeFile.calledOnce).to.be.true;
            var name = require('path').basename(fsPromisesStub.writeFile.firstCall.args[0]);
            expect(name).to.match(/^rad-\d{8}-\d{6}\.json$/);
            expect(res._json.redirect).to.equal('/database');
            expect(auditLoggerStub.info.calledOnce).to.be.true;
        });

        it('creates two backups for core=both', async function () {
            backupStub.exportCore.resolves(Buffer.from('[]', 'utf8'));

            var req = mockReq({
                method: 'POST',
                body: { core: 'both' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/backup')(req, res, next);

            expect(backupStub.exportCore.callCount).to.equal(2);
            expect(backupStub.exportCore.getCall(0).args[0]).to.equal('rad');
            expect(backupStub.exportCore.getCall(1).args[0]).to.equal('source');
            expect(fsPromisesStub.writeFile.callCount).to.equal(2);
        });

        it('rejects an invalid core with 400', async function () {
            var req = mockReq({
                method: 'POST',
                body: { core: 'evil' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/backup')(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(backupStub.exportCore.called).to.be.false;
            expect(fsPromisesStub.writeFile.called).to.be.false;
        });

        it('returns 500 with no audit log when export fails', async function () {
            backupStub.exportCore.rejects(new Error('Solr down'));

            var req = mockReq({
                method: 'POST',
                body: { core: 'rad' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/backup')(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(fsPromisesStub.writeFile.called).to.be.false;
            expect(auditLoggerStub.info.called).to.be.false;
        });

        it('ensures the backup directory exists before writing', async function () {
            backupStub.exportCore.resolves(Buffer.from('[]', 'utf8'));

            var req = mockReq({
                method: 'POST',
                body: { core: 'rad' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/backup')(req, res, next);

            expect(fsPromisesStub.mkdir.calledOnce).to.be.true;
            expect(fsPromisesStub.mkdir.firstCall.args[1]).to.deep.equal({ recursive: true });
        });
    });

    describe('POST /recompute', function () {
        it('scans rad, persists scanned values, and returns the change set', async function () {
            statsStub.scanCore.resolves({ numRecords: 100, highestId: 200, latest: '2025-01-01' });
            dbStub.replaceStats.resolves({
                before: { numRecords: 95, highestId: 200, latest: '2024-12-31' },
                after: { numRecords: 100, highestId: 200, latest: '2025-01-01', updated: '2026-05-03' },
                changes: {
                    numRecords: { from: 95, to: 100 },
                    latest: { from: '2024-12-31', to: '2025-01-01' }
                }
            });

            var req = mockReq({
                method: 'POST',
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/recompute')(req, res, next);

            expect(statsStub.scanCore.calledOnceWith('rad')).to.be.true;
            expect(dbStub.replaceStats.calledOnceWith({ numRecords: 100, highestId: 200, latest: '2025-01-01' })).to.be.true;
            expect(res._json.changed).to.be.true;
            expect(res._json.changes.numRecords).to.deep.equal({ from: 95, to: 100 });
            expect(res._json.current).to.deep.equal({ numRecords: 100, highestId: 200, latest: '2025-01-01' });
            expect(auditLoggerStub.info.calledOnce).to.be.true;
        });

        it('reports changed=false and skips the audit log when nothing changed', async function () {
            statsStub.scanCore.resolves({ numRecords: 100, highestId: 200, latest: '2025-01-01' });
            dbStub.replaceStats.resolves({
                before: { numRecords: 100, highestId: 200, latest: '2025-01-01' },
                after: { numRecords: 100, highestId: 200, latest: '2025-01-01', updated: '2026-05-03' },
                changes: {}
            });

            var req = mockReq({
                method: 'POST',
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/recompute')(req, res, next);

            expect(res._json.changed).to.be.false;
            expect(res._json.changes).to.deep.equal({});
            expect(auditLoggerStub.info.called).to.be.false;
        });

        it('returns 500 with no audit log when scan fails', async function () {
            statsStub.scanCore.rejects(new Error('Solr down'));

            var req = mockReq({
                method: 'POST',
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/recompute')(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(dbStub.replaceStats.called).to.be.false;
            expect(auditLoggerStub.info.called).to.be.false;
        });

        it('returns 500 with no audit log when replaceStats fails', async function () {
            statsStub.scanCore.resolves({ numRecords: 1, highestId: 1, latest: null });
            dbStub.replaceStats.rejects(new Error('disk full'));

            var req = mockReq({
                method: 'POST',
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'post', '/recompute')(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(auditLoggerStub.info.called).to.be.false;
        });
    });

    describe('DELETE /backup/:filename', function () {
        it('unlinks a valid backup filename', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { filename: 'rad-20260101-120000.json' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'delete', '/backup/:filename')(req, res, next);

            expect(fsPromisesStub.unlink.calledOnce).to.be.true;
            var arg = fsPromisesStub.unlink.firstCall.args[0];
            expect(arg).to.include('rad-20260101-120000.json');
            expect(res._json.redirect).to.equal('/database');
            expect(auditLoggerStub.info.calledOnce).to.be.true;
        });

        it('rejects path traversal attempts with 400', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { filename: '../package.json' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'delete', '/backup/:filename')(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(fsPromisesStub.unlink.called).to.be.false;
        });

        it('rejects names not matching the backup pattern', async function () {
            var req = mockReq({
                method: 'DELETE',
                params: { filename: 'random.json' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'delete', '/backup/:filename')(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(fsPromisesStub.unlink.called).to.be.false;
        });

        it('returns 500 when unlink fails', async function () {
            fsPromisesStub.unlink.rejects(new Error('permission denied'));
            var req = mockReq({
                method: 'DELETE',
                params: { filename: 'rad-20260101-120000.json' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            await findHandler(dbRouter, 'delete', '/backup/:filename')(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(auditLoggerStub.info.called).to.be.false;
        });
    });
});
