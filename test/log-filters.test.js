var expect = require('chai').expect;
var { accessLogSkip, botLogSkip, queryLogSkip } = require('../server/log-filters');

// Builds the subset of an express request the filters actually inspect.
function req(method, urlOrPath, query) {
    var path = urlOrPath.split('?')[0];
    return {
        method: method,
        path: path,
        originalUrl: urlOrPath,
        query: query || {}
    };
}

describe('Log filters (#150)', function () {

    describe('accessLogSkip — what reaches access.log', function () {

        it('logs GET /', function () {
            expect(accessLogSkip(req('GET', '/'))).to.be.false;
        });

        it('logs known admin routes like /tasks', function () {
            expect(accessLogSkip(req('GET', '/tasks'))).to.be.false;
            expect(accessLogSkip(req('GET', '/refs/42'))).to.be.false;
            expect(accessLogSkip(req('POST', '/users/invite'))).to.be.false;
        });

        it('logs /aggregator.html (the lone extensioned route)', function () {
            expect(accessLogSkip(req('GET', '/aggregator.html'))).to.be.false;
        });

        it('skips bot probes that share a substring with a known route', function () {
            expect(accessLogSkip(req('GET', '/login.php'))).to.be.true;
            expect(accessLogSkip(req('GET', '/users.asp'))).to.be.true;
            expect(accessLogSkip(req('GET', '/wp-login'))).to.be.true;
        });

        it('skips PROPFIND even against a valid path (#150)', function () {
            expect(accessLogSkip(req('PROPFIND', '/solr/rad/refs'))).to.be.true;
            expect(accessLogSkip(req('OPTIONS', '/refs'))).to.be.true;
            expect(accessLogSkip(req('SEARCH', '/'))).to.be.true;
        });

        it('skips static-asset segments', function () {
            expect(accessLogSkip(req('GET', '/javascripts/index.js'))).to.be.true;
            expect(accessLogSkip(req('GET', '/favicon.ico'))).to.be.true;
            expect(accessLogSkip(req('GET', '/fonts/bs.woff'))).to.be.true;
        });

        it('skips POST / (form spam against the home page)', function () {
            expect(accessLogSkip(req('POST', '/'))).to.be.true;
        });
    });

    describe('botLogSkip — what reaches bot.log', function () {

        it('skips GET / and static assets', function () {
            expect(botLogSkip(req('GET', '/'))).to.be.true;
            expect(botLogSkip(req('GET', '/favicon.ico'))).to.be.true;
            expect(botLogSkip(req('GET', '/javascripts/foo.js'))).to.be.true;
        });

        it('skips legitimate routes under their proper verb', function () {
            expect(botLogSkip(req('GET', '/tasks'))).to.be.true;
            expect(botLogSkip(req('GET', '/refs/42'))).to.be.true;
            expect(botLogSkip(req('POST', '/users/invite'))).to.be.true;
        });

        it('logs unknown paths (typical bot probes)', function () {
            expect(botLogSkip(req('GET', '/login.php'))).to.be.false;
            expect(botLogSkip(req('GET', '/wp-admin'))).to.be.false;
            expect(botLogSkip(req('POST', '/'))).to.be.false;
        });

        it('logs probe verbs even when the path is valid (#150)', function () {
            expect(botLogSkip(req('PROPFIND', '/solr/rad/refs'))).to.be.false;
            expect(botLogSkip(req('OPTIONS', '/refs'))).to.be.false;
        });
    });

    describe('queryLogSkip — what reaches queries.log', function () {

        it('logs text searches (?q=…)', function () {
            expect(queryLogSkip(req('GET', '/?q=darwin', { q: 'darwin' }))).to.be.false;
        });

        it('logs random searches (?seed=…) (#150)', function () {
            expect(queryLogSkip(req('GET', '/?seed=abc123', { seed: 'abc123' }))).to.be.false;
        });

        it('logs searches with reordered query params', function () {
            expect(queryLogSkip(req('GET', '/?start=10&q=darwin', { start: '10', q: 'darwin' }))).to.be.false;
            expect(queryLogSkip(req('GET', '/?rows=30&seed=foo', { rows: '30', seed: 'foo' }))).to.be.false;
        });

        it('skips plain home-page loads (no q/seed)', function () {
            expect(queryLogSkip(req('GET', '/'))).to.be.true;
            expect(queryLogSkip(req('GET', '/?type=articles', { type: 'articles' }))).to.be.true;
        });

        it('skips non-home pages even if they have a q param', function () {
            expect(queryLogSkip(req('GET', '/refs?q=darwin', { q: 'darwin' }))).to.be.true;
        });
    });
});
