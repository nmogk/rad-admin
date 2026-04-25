var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var EventEmitter = require('events').EventEmitter;

// Build a fake http module whose .request captures call args, returns a writable
// req emitter, and invokes the response callback with a configurable response.
function makeHttpStub() {
    var captured = [];
    function request(opts, cb) {
        var req = new EventEmitter();
        req.write = sinon.stub();
        req.end = sinon.stub();
        var entry = { opts: opts, body: null, req: req };
        captured.push(entry);
        // Capture body via req.write
        req.write.callsFake(function (chunk) { entry.body = chunk; });
        // Defer the response so the caller can wire it up
        req._respond = function (statusCode, bodyString) {
            var res = new EventEmitter();
            res.statusCode = statusCode;
            cb(res);
            // Emit data and end on next tick so promise consumers can attach
            setImmediate(function () {
                if (bodyString) res.emit('data', Buffer.from(bodyString, 'utf8'));
                res.emit('end');
            });
        };
        req._fail = function (err) {
            setImmediate(function () { req.emit('error', err); });
        };
        return req;
    }
    return { request: sinon.stub().callsFake(request), _captured: captured };
}

var auditLoggerStub = { debug: sinon.stub(), warn: sinon.stub() };
var log4jsStub = { getLogger: sinon.stub().returns(auditLoggerStub) };

function load(httpStub) {
    return proxyquire('../config/solr-client', {
        'http': httpStub,
        'log4js': log4jsStub
    });
}

describe('config/solr-client', function () {

    var httpStub, solr, client;

    beforeEach(function () {
        httpStub = makeHttpStub();
        solr = load(httpStub);
        client = solr.createClient({ host: 'example', port: 9999, core: 'rad' });
    });

    describe('get(route, query)', function () {
        it('issues GET to /api/cores/<core>/<route>?<query>', function () {
            var p = client.get('select', 'q=name:%22X%22&rows=1');
            var entry = httpStub._captured[0];
            expect(entry.opts.method).to.equal('GET');
            expect(entry.opts.host).to.equal('example');
            expect(entry.opts.port).to.equal(9999);
            expect(entry.opts.path).to.equal('/api/cores/rad/select?q=name:%22X%22&rows=1');
            entry.req._respond(200, '{"response":{"numFound":0,"docs":[]}}');
            return p.then(function (obj) {
                expect(obj.response.numFound).to.equal(0);
            });
        });

        it('omits the query string when query is empty', function () {
            var p = client.get('select', '');
            expect(httpStub._captured[0].opts.path).to.equal('/api/cores/rad/select');
            httpStub._captured[0].req._respond(200, '{}');
            return p;
        });

        it('rejects on non-2xx with status and body on the error', function () {
            var p = client.get('select', 'q=*:*');
            httpStub._captured[0].req._respond(500, 'boom');
            return p.then(
                function () { throw new Error('expected rejection'); },
                function (err) {
                    expect(err.status).to.equal(500);
                    expect(err.body).to.equal('boom');
                }
            );
        });

        it('rejects on invalid JSON in response', function () {
            var p = client.get('select', 'q=*:*');
            httpStub._captured[0].req._respond(200, 'not-json');
            return p.then(
                function () { throw new Error('expected rejection'); },
                function (err) { expect(err).to.be.instanceOf(SyntaxError); }
            );
        });

        it('rejects when the underlying request emits an error', function () {
            var p = client.get('select', 'q=*:*');
            httpStub._captured[0].req._fail(new Error('connect refused'));
            return p.then(
                function () { throw new Error('expected rejection'); },
                function (err) { expect(err.message).to.equal('connect refused'); }
            );
        });
    });

    describe('add(doc)', function () {
        it('POSTs {add:{doc,overwrite:true}} to /update?commit=true', function () {
            var doc = { id: 42, title: 'X' };
            var p = client.add(doc);
            var entry = httpStub._captured[0];
            expect(entry.opts.method).to.equal('POST');
            expect(entry.opts.path).to.equal('/api/cores/rad/update?commit=true');
            expect(entry.opts.headers['Content-Type']).to.match(/application\/json/);
            var body = JSON.parse(entry.body.toString());
            expect(body).to.deep.equal({ add: { doc: doc, overwrite: true } });
            entry.req._respond(200, '{"responseHeader":{"status":0}}');
            return p;
        });
    });

    describe('deleteByID(id)', function () {
        it('does a pre-select then a delete, resolving with the pre-selected doc', function () {
            var p = client.deleteByID(42);

            // First call: select
            var sel = httpStub._captured[0];
            expect(sel.opts.method).to.equal('GET');
            expect(sel.opts.path).to.equal('/api/cores/rad/select?q=id:42&rows=1');
            sel.req._respond(200, '{"response":{"docs":[{"id":42,"title":"Old"}]}}');

            // Need to wait for the next request to be issued
            return new Promise(function (resolve) { setImmediate(resolve); }).then(function () {
                var del = httpStub._captured[1];
                expect(del.opts.method).to.equal('POST');
                expect(del.opts.path).to.equal('/api/cores/rad/update?commit=true');
                var body = JSON.parse(del.body.toString());
                expect(body).to.deep.equal({ delete: { id: '42' } });
                del.req._respond(200, '{"responseHeader":{"status":0}}');
                return p;
            }).then(function (deletedDoc) {
                expect(deletedDoc).to.deep.equal({ id: 42, title: 'Old' });
            });
        });

        it('resolves with undefined when pre-select returns no docs', function () {
            var p = client.deleteByID('nope');
            httpStub._captured[0].req._respond(200, '{"response":{"docs":[]}}');
            return new Promise(function (resolve) { setImmediate(resolve); }).then(function () {
                httpStub._captured[1].req._respond(200, '{}');
                return p;
            }).then(function (doc) {
                expect(doc).to.be.undefined;
            });
        });

        it('encodes special characters in the id for the pre-select query', function () {
            client.deleteByID('foo bar/baz');
            expect(httpStub._captured[0].opts.path).to.equal(
                '/api/cores/rad/select?q=id:' + encodeURIComponent('foo bar/baz') + '&rows=1'
            );
        });
    });

    describe('per-core path', function () {
        it('targets a different core when constructed with one', function () {
            var sourceClient = solr.createClient({ host: 'example', port: 9999, core: 'source' });
            sourceClient.get('select', 'q=*:*');
            expect(httpStub._captured[0].opts.path).to.equal('/api/cores/source/select?q=*:*');
        });
    });
});
