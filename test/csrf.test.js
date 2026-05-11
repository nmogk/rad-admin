var expect = require('chai').expect;
var sinon = require('sinon');
var { doubleCsrf } = require('csrf-csrf');

// Exercises the csrf-csrf middleware with the same config app.js uses, to
// catch regressions in: header-vs-body token extraction, the GET/HEAD/OPTIONS
// bypass, and the EBADCSRFTOKEN error shape that app.js's rejection handler
// keys off of.

function buildCsrf() {
    return doubleCsrf({
        getSecret: function () { return 'test-secret-for-csrf-tests-only'; },
        getSessionIdentifier: function (req) { return req.sessionID || req.ip; },
        cookieName: '__Host-x-csrf-token',
        cookieOptions: { sameSite: 'strict', secure: true, httpOnly: true, path: '/' },
        size: 64,
        ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
        getCsrfTokenFromRequest: function (req) {
            return req.headers['x-csrf-token'] || (req.body && req.body._csrf);
        }
    });
}

// Build a request/response pair that csrf-csrf's middleware can interact with.
// The library reads cookies/headers/body and writes back via res.cookie().
function mockReqRes(opts) {
    opts = opts || {};
    var req = {
        method: opts.method || 'POST',
        cookies: opts.cookies || {},
        signedCookies: opts.signedCookies || {},
        headers: opts.headers || {},
        body: opts.body || {},
        sessionID: opts.sessionID || 'sess-1',
        ip: '127.0.0.1'
    };
    var setCookies = {};
    var res = {
        statusCode: 200,
        cookie: sinon.stub().callsFake(function (name, value) {
            setCookies[name] = value;
            req.cookies[name] = value; // mirror so a subsequent validation reads it
        }),
        clearCookie: sinon.stub(),
        getHeader: sinon.stub(),
        setHeader: sinon.stub()
    };
    return { req: req, res: res, setCookies: setCookies };
}

describe('CSRF protection', function () {
    var csrf;
    beforeEach(function () { csrf = buildCsrf(); });

    describe('generateCsrfToken', function () {
        it('produces a string and sets the csrf cookie', function () {
            var ctx = mockReqRes({ method: 'GET' });
            var token = csrf.generateCsrfToken(ctx.req, ctx.res);
            expect(token).to.be.a('string').and.have.length.greaterThan(10);
            expect(ctx.res.cookie.called).to.be.true;
            expect(ctx.res.cookie.firstCall.args[0]).to.equal('__Host-x-csrf-token');
        });
    });

    describe('doubleCsrfProtection middleware', function () {
        it('allows GET without a token', function (done) {
            var ctx = mockReqRes({ method: 'GET' });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.be.undefined;
                done();
            });
        });

        it('rejects POST without a token with EBADCSRFTOKEN', function (done) {
            var ctx = mockReqRes({ method: 'POST' });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.exist;
                expect(err.code).to.equal('EBADCSRFTOKEN');
                done();
            });
        });

        it('rejects DELETE without a token with EBADCSRFTOKEN', function (done) {
            var ctx = mockReqRes({ method: 'DELETE' });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.exist;
                expect(err.code).to.equal('EBADCSRFTOKEN');
                done();
            });
        });

        it('accepts POST whose x-csrf-token header matches the signed cookie', function (done) {
            // Issue a token on a fake GET, then replay it on a POST with the
            // same sessionID — that's the success path the AJAX clients hit.
            var seed = mockReqRes({ method: 'GET', sessionID: 'sess-A' });
            var token = csrf.generateCsrfToken(seed.req, seed.res);
            var cookieValue = seed.setCookies['__Host-x-csrf-token'];

            var ctx = mockReqRes({
                method: 'POST',
                sessionID: 'sess-A',
                cookies: { '__Host-x-csrf-token': cookieValue },
                headers: { 'x-csrf-token': token }
            });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.be.undefined;
                done();
            });
        });

        it('accepts POST whose _csrf body field matches the signed cookie (form path)', function (done) {
            var seed = mockReqRes({ method: 'GET', sessionID: 'sess-B' });
            var token = csrf.generateCsrfToken(seed.req, seed.res);
            var cookieValue = seed.setCookies['__Host-x-csrf-token'];

            var ctx = mockReqRes({
                method: 'POST',
                sessionID: 'sess-B',
                cookies: { '__Host-x-csrf-token': cookieValue },
                body: { _csrf: token }
            });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.be.undefined;
                done();
            });
        });

        it('rejects POST when the session identifier differs from the issuing session', function (done) {
            var seed = mockReqRes({ method: 'GET', sessionID: 'sess-issuer' });
            var token = csrf.generateCsrfToken(seed.req, seed.res);
            var cookieValue = seed.setCookies['__Host-x-csrf-token'];

            var ctx = mockReqRes({
                method: 'POST',
                sessionID: 'sess-other',
                cookies: { '__Host-x-csrf-token': cookieValue },
                headers: { 'x-csrf-token': token }
            });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.exist;
                expect(err.code).to.equal('EBADCSRFTOKEN');
                done();
            });
        });

        it('rejects POST when the header token does not match the cookie', function (done) {
            var seed = mockReqRes({ method: 'GET', sessionID: 'sess-C' });
            csrf.generateCsrfToken(seed.req, seed.res);
            var cookieValue = seed.setCookies['__Host-x-csrf-token'];

            var ctx = mockReqRes({
                method: 'POST',
                sessionID: 'sess-C',
                cookies: { '__Host-x-csrf-token': cookieValue },
                headers: { 'x-csrf-token': 'tampered-token-value' }
            });
            csrf.doubleCsrfProtection(ctx.req, ctx.res, function (err) {
                expect(err).to.exist;
                expect(err.code).to.equal('EBADCSRFTOKEN');
                done();
            });
        });
    });
});
