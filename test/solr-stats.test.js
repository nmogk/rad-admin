var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();

var solrClientStub, solrProxyStub, stats;

function load() {
    return proxyquire('../server/solr-stats', {
        './solr-client': solrClientStub,
        '../config/solr-proxy': solrProxyStub
    });
}

describe('server/solr-stats', function () {

    var clientStub;

    beforeEach(function () {
        clientStub = { get: sinon.stub() };
        solrClientStub = { createClient: sinon.stub().returns(clientStub) };
        solrProxyStub = { backend: { host: 'localhost', port: 8983 } };
        stats = load();
    });

    describe('scanCore(coreName)', function () {
        it('creates a client for the requested core with proxy backend coords', async function () {
            clientStub.get.resolves({ response: { docs: [] }, nextCursorMark: '*' });
            await stats.scanCore('rad');
            expect(solrClientStub.createClient.calledOnce).to.be.true;
            expect(solrClientStub.createClient.firstCall.args[0]).to.deep.equal({
                host: 'localhost', port: 8983, core: 'rad'
            });
        });

        it('returns zeros and null latest/latestId on an empty core', async function () {
            clientStub.get.resolves({ response: { docs: [] }, nextCursorMark: '*' });
            var result = await stats.scanCore('rad');
            expect(result).to.deep.equal({ numRecords: 0, highestId: 0, latest: null, latestId: null });
        });

        it('counts docs, picks max numeric id, picks max dt date, and reports the latest doc id', async function () {
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '5',   dt: '2020-01-01' },
                        { id: '100', dt: '2024-07-15' },
                        { id: '23',  dt: '2022-03' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.numRecords).to.equal(3);
            expect(result.highestId).to.equal(100);
            expect(result.latest).to.equal('2024-07-15');
            expect(result.latestId).to.equal('100');
        });

        it('uses numeric (not lexicographic) comparison for id', async function () {
            // String sort would put "1000" < "9", so this catches the parseInt path.
            clientStub.get.resolves({
                response: { docs: [{ id: '9' }, { id: '1000' }, { id: '500' }] },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.highestId).to.equal(1000);
        });

        it('skips non-numeric ids without throwing', async function () {
            clientStub.get.resolves({
                response: { docs: [{ id: 'abc' }, { id: '50' }, { id: null }] },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.numRecords).to.equal(3);
            expect(result.highestId).to.equal(50);
        });

        it('handles year-only and year-month dt formats', async function () {
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '1', dt: '2024' },
                        { id: '2', dt: '2024-06' },
                        { id: '3', dt: '2023-12-31' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            // 2024-06-01 > 2024-01-01 > 2023-12-31
            expect(result.latest).to.equal('2024-06-01');
        });

        it('ignores docs with no dt and docs with unparseable dt', async function () {
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '1' },
                        { id: '2', dt: 'not a date' },
                        { id: '3', dt: '2024-05-05' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.numRecords).to.equal(3);
            expect(result.latest).to.equal('2024-05-05');
        });

        it('rejects extended-year ISO and slash/word formats that JS Date would parse leniently', async function () {
            // Without strict validation, "+020120-01-15" yields year 20120
            // and "01/15/2024" / "January 15, 2024" parse via Date's fallbacks
            // — none of these are the format we promise to store.
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '1', dt: '+020120-01-15' },
                        { id: '2', dt: '01/15/2024' },
                        { id: '3', dt: 'January 15, 2024' },
                        { id: '4', dt: '20120-01-15' },
                        { id: '5', dt: '2024-06-15' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.numRecords).to.equal(5);
            expect(result.latest).to.equal('2024-06-15');
            // Critical: the bad inputs must NOT produce an expanded-year output.
            expect(result.latest).to.not.contain('+');
            expect(result.latest).to.not.match(/^\d{5,}/);
        });

        it('rejects unpadded month/day even though Date would accept them', async function () {
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '1', dt: '2024-1-5' },
                        { id: '2', dt: '2024-01-05' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.latest).to.equal('2024-01-05');
        });

        it('rejects out-of-range months/days and Feb-30 style rollovers', async function () {
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '1', dt: '2024-13-01' },
                        { id: '2', dt: '2024-02-30' },
                        { id: '3', dt: '2024-06-15' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.latest).to.equal('2024-06-15');
        });

        it('always emits a 4-digit YYYY-MM-DD output', async function () {
            clientStub.get.resolves({
                response: { docs: [{ id: '1', dt: '2024' }] },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.latest).to.equal('2024-01-01');
            expect(result.latest).to.match(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('aggregates across multiple cursor pages', async function () {
            clientStub.get.onCall(0).resolves({
                response: { docs: [{ id: '1', dt: '2020-01-01' }, { id: '2', dt: '2021-01-01' }] },
                nextCursorMark: 'AoEpMQ=='
            });
            clientStub.get.onCall(1).resolves({
                response: { docs: [{ id: '500', dt: '2024-12-31' }] },
                nextCursorMark: 'AoEpMw=='
            });
            clientStub.get.onCall(2).resolves({
                response: { docs: [] },
                nextCursorMark: 'AoEpMw=='
            });
            var result = await stats.scanCore('rad');
            expect(clientStub.get.callCount).to.equal(3);
            expect(result).to.deep.equal({ numRecords: 3, highestId: 500, latest: '2024-12-31', latestId: '500' });
        });

        it('reports null latestId when no doc has a parseable date', async function () {
            clientStub.get.resolves({
                response: { docs: [{ id: '1' }, { id: '2', dt: 'garbage' }] },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.latest).to.be.null;
            expect(result.latestId).to.be.null;
        });

        it('does not credit a malformed date with the latestId', async function () {
            // Doc 99 has a bogus dt that the strict parser rejects; doc 7 is the
            // real latest. latestId must point at 7, not 99.
            clientStub.get.resolves({
                response: {
                    docs: [
                        { id: '99', dt: '+020120-01-15' },
                        { id: '7',  dt: '2024-06-15' }
                    ]
                },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.latest).to.equal('2024-06-15');
            expect(result.latestId).to.equal('7');
        });

        it('terminates when nextCursorMark equals the previous mark', async function () {
            clientStub.get.resolves({
                response: { docs: [{ id: '1' }] },
                nextCursorMark: '*'
            });
            await stats.scanCore('rad');
            expect(clientStub.get.callCount).to.equal(1);
        });

        it('hits /select with id+dt fl, *:*, id-asc sort, and rows=1000', async function () {
            clientStub.get.resolves({ response: { docs: [] }, nextCursorMark: '*' });
            await stats.scanCore('rad');
            var route = clientStub.get.firstCall.args[0];
            var query = clientStub.get.firstCall.args[1];
            expect(route).to.equal('select');
            expect(query).to.include('q=*:*');
            expect(query).to.include('sort=id+asc');
            expect(query).to.include('rows=1000');
            expect(query).to.include('fl=id,dt');
        });

        it('encodes cursorMark on subsequent requests', async function () {
            clientStub.get.onCall(0).resolves({
                response: { docs: [{ id: '1' }] },
                nextCursorMark: 'AoE+/Q=='
            });
            clientStub.get.onCall(1).resolves({
                response: { docs: [] },
                nextCursorMark: 'AoE+/Q=='
            });
            await stats.scanCore('rad');
            var secondQuery = clientStub.get.getCall(1).args[1];
            expect(secondQuery).to.include('cursorMark=' + encodeURIComponent('AoE+/Q=='));
            expect(secondQuery).to.not.include('+/Q==');
        });

        it('handles dt arriving as an array (defensive)', async function () {
            clientStub.get.resolves({
                response: { docs: [{ id: '1', dt: ['2024-08-08'] }] },
                nextCursorMark: '*'
            });
            var result = await stats.scanCore('rad');
            expect(result.latest).to.equal('2024-08-08');
        });
    });
});
