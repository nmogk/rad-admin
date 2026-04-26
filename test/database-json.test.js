var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();

var fsPromisesStub = {
    readFile: sinon.stub(),
    writeFile: sinon.stub()
};
var fsStub = { promises: fsPromisesStub };

var db = proxyquire('../config/database-json', { 'fs': fsStub });

describe('config/database-json', function () {

    var clock;

    beforeEach(function () {
        fsPromisesStub.readFile.reset();
        fsPromisesStub.writeFile.reset();
        fsPromisesStub.writeFile.resolves();
        // Freeze "today" at 2025-06-15 so toIsoDate is deterministic
        clock = sinon.useFakeTimers(new Date('2025-06-15T12:34:56Z').getTime());
    });

    afterEach(function () {
        clock.restore();
    });

    function setDb(data) {
        fsPromisesStub.readFile.resolves(JSON.stringify(data));
    }

    describe('read()', function () {
        it('parses database.json and returns the object', async function () {
            setDb({ numRecords: 10, highestId: 99, latest: '2024-01-01', updated: '2024-01-02' });
            var result = await db.read();
            expect(result.numRecords).to.equal(10);
            expect(result.highestId).to.equal(99);
            expect(fsPromisesStub.readFile.calledWith('database.json')).to.be.true;
        });
    });

    describe('getHighestId()', function () {
        it('returns the highestId field', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            expect(await db.getHighestId()).to.equal(500);
        });
    });

    describe('reserveId()', function () {
        it('bumps highestId by 1, writes, and resolves with the new id', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            var newId = await db.reserveId();
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(newId).to.equal(501);
            expect(written.highestId).to.equal(501);
        });

        it('serializes concurrent calls so each reservation is unique', async function () {
            // Both reads see the same starting state, but the lock forces them
            // to run sequentially — so the second read happens after the first write.
            var current = { numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' };
            fsPromisesStub.readFile.callsFake(function () {
                return Promise.resolve(JSON.stringify(current));
            });
            fsPromisesStub.writeFile.callsFake(function (_path, body) {
                current = JSON.parse(body);
                return Promise.resolve();
            });

            var ids = await Promise.all([db.reserveId(), db.reserveId(), db.reserveId()]);
            expect(ids).to.deep.equal([501, 502, 503]);
            expect(current.highestId).to.equal(503);
        });
    });

    describe('recordInsert(date)', function () {
        it('bumps numRecords and sets updated to today, leaves highestId alone', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            await db.recordInsert(null);
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.highestId).to.equal(500);
            expect(written.numRecords).to.equal(11);
            expect(written.updated).to.equal('2025-06-15');
        });

        it('updates latest when new doc date is later than current latest', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            await db.recordInsert('2025-08-01');
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.latest).to.equal('2025-08-01');
        });

        it('leaves latest alone when new doc date is earlier than current latest', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-12-31', updated: '2024-01-02' });
            await db.recordInsert('2024-01-01');
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.latest).to.equal('2024-12-31');
        });

        it('leaves latest alone when no date is given', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-12-31', updated: '2024-01-02' });
            await db.recordInsert(undefined);
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.latest).to.equal('2024-12-31');
        });
    });

    describe('recordEdit(date)', function () {
        it('updates the updated field but does not change highestId or numRecords', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            await db.recordEdit(null);
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.highestId).to.equal(500);
            expect(written.numRecords).to.equal(10);
            expect(written.updated).to.equal('2025-06-15');
        });

        it('updates latest when edited doc date is later', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            await db.recordEdit('2025-09-01');
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.latest).to.equal('2025-09-01');
        });
    });

    describe('recordDelete()', function () {
        it('decrements numRecords and updates the updated field', async function () {
            setDb({ numRecords: 10, highestId: 500, latest: '2024-01-01', updated: '2024-01-02' });
            await db.recordDelete();
            var written = JSON.parse(fsPromisesStub.writeFile.firstCall.args[1]);
            expect(written.numRecords).to.equal(9);
            expect(written.updated).to.equal('2025-06-15');
            expect(written.highestId).to.equal(500);
        });
    });
});
