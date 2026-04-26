var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();

var solrClientStub, solrProxyStub, backup;

function load() {
    return proxyquire('../config/solr-backup', {
        './solr-client': solrClientStub,
        './solr-proxy': solrProxyStub
    });
}

describe('config/solr-backup', function () {

    var clientStub;

    beforeEach(function () {
        clientStub = { get: sinon.stub() };
        solrClientStub = { createClient: sinon.stub().returns(clientStub) };
        solrProxyStub = { backend: { host: 'localhost', port: 8983 } };
        backup = load();
    });

    describe('exportCore(coreName)', function () {
        it('creates a client for the requested core with proxy backend coords', async function () {
            clientStub.get.resolves({ response: { docs: [] }, nextCursorMark: '*' });
            await backup.exportCore('rad');
            expect(solrClientStub.createClient.calledOnce).to.be.true;
            var opts = solrClientStub.createClient.firstCall.args[0];
            expect(opts).to.deep.equal({ host: 'localhost', port: 8983, core: 'rad' });
        });

        it('terminates when nextCursorMark equals the previous mark', async function () {
            clientStub.get.resolves({
                response: { docs: [{ id: 1 }, { id: 2 }] },
                nextCursorMark: '*'
            });
            var buf = await backup.exportCore('rad');
            expect(clientStub.get.callCount).to.equal(1);
            expect(JSON.parse(buf.toString('utf8'))).to.deep.equal([{ id: 1 }, { id: 2 }]);
        });

        it('concatenates docs across multiple pages until cursor stabilizes', async function () {
            clientStub.get.onCall(0).resolves({
                response: { docs: [{ id: 1 }, { id: 2 }] },
                nextCursorMark: 'AoEpMQ=='
            });
            clientStub.get.onCall(1).resolves({
                response: { docs: [{ id: 3 }, { id: 4 }] },
                nextCursorMark: 'AoEpMw=='
            });
            clientStub.get.onCall(2).resolves({
                response: { docs: [{ id: 5 }] },
                nextCursorMark: 'AoEpMw=='
            });
            var buf = await backup.exportCore('rad');
            expect(clientStub.get.callCount).to.equal(3);
            expect(JSON.parse(buf.toString('utf8'))).to.deep.equal([
                { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
            ]);
        });

        it('passes the cursorMark URL-encoded on each subsequent request', async function () {
            // nextCursorMark from Solr is base64; can contain '+' and '/'
            // which need encoding before going on the query string.
            clientStub.get.onCall(0).resolves({
                response: { docs: [{ id: 1 }] },
                nextCursorMark: 'AoE+/Q=='
            });
            clientStub.get.onCall(1).resolves({
                response: { docs: [] },
                nextCursorMark: 'AoE+/Q=='
            });
            await backup.exportCore('rad');
            var firstQuery = clientStub.get.getCall(0).args[1];
            var secondQuery = clientStub.get.getCall(1).args[1];
            expect(firstQuery).to.include('cursorMark=' + encodeURIComponent('*'));
            expect(secondQuery).to.include('cursorMark=' + encodeURIComponent('AoE+/Q=='));
            // Sanity: '+' and '/' are not raw in the encoded query.
            expect(secondQuery).to.not.include('+/Q==');
        });

        it('hits the /select handler with q=*:* and id-asc sort', async function () {
            clientStub.get.resolves({ response: { docs: [] }, nextCursorMark: '*' });
            await backup.exportCore('source');
            var route = clientStub.get.firstCall.args[0];
            var query = clientStub.get.firstCall.args[1];
            expect(route).to.equal('select');
            expect(query).to.include('q=*:*');
            expect(query).to.include('sort=id+asc');
            expect(query).to.include('rows=1000');
        });

        it('rejects when the underlying solr-client request fails', async function () {
            clientStub.get.rejects(new Error('connect refused'));
            try {
                await backup.exportCore('rad');
                throw new Error('expected rejection');
            } catch (err) {
                expect(err.message).to.equal('connect refused');
            }
        });

        it('returns an empty JSON array when the core has no docs', async function () {
            clientStub.get.resolves({ response: { docs: [] }, nextCursorMark: '*' });
            var buf = await backup.exportCore('rad');
            expect(buf).to.be.instanceOf(Buffer);
            expect(JSON.parse(buf.toString('utf8'))).to.deep.equal([]);
        });
    });
});
