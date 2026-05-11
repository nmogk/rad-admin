var sinon = require('sinon');

/**
 * Creates a mock Express request object with common defaults.
 * Override any property by passing it in the opts object.
 */
function mockReq(opts) {
    var defaults = {
        method: 'GET',
        path: '/',
        url: '/',
        originalUrl: '/',
        baseUrl: '/',
        query: {},
        params: {},
        body: {},
        headers: {},
        secure: false,
        replacements: undefined,
        user: null,
        flash: sinon.stub().returns([]),
        isAuthenticated: sinon.stub().returns(false),
        get: sinon.stub().returns('')
    };
    return Object.assign(defaults, opts);
}

/**
 * Creates a mock Express response object.
 * All chainable methods return the response for chaining.
 */
function mockRes() {
    var res = {
        statusCode: 200,
        _redirectUrl: null,
        _redirectStatus: null,
        _rendered: null,
        _renderedData: null,
        _json: null,
        _ended: false
    };
    res.status = sinon.stub().callsFake(function (code) { res.statusCode = code; return res; });
    res.redirect = sinon.stub().callsFake(function (status, url) { res._redirectStatus = status; res._redirectUrl = url; });
    res.render = sinon.stub().callsFake(function (view, data) { res._rendered = view; res._renderedData = data; });
    res.json = sinon.stub().callsFake(function (data) { res._json = data; return res; });
    res.jsonp = sinon.stub().callsFake(function (data) { res._json = data; return res; });
    res.send = sinon.stub().returns(res);
    res.end = sinon.stub().callsFake(function () { res._ended = true; });
    res.writeHead = sinon.stub();
    res.write = sinon.stub();
    res.setHeader = sinon.stub();
    return res;
}

/**
 * Creates a mock Objection user model instance: a plain object with attribute
 * properties plus a chainable $query() and an authenticate() stub. Tests can
 * assert against `user._qb.patch.calledWith(...)` etc.
 */
function mockUser(attrs) {
    var defaults = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        permission: 0,
        validated: 1,
        password_digest: '$2b$10$fakehash'
    };
    var user = Object.assign({}, defaults, attrs);
    var qb = mockQueryBuilder();
    user.$query = sinon.stub().returns(qb);
    user.authenticate = sinon.stub().resolves(user);
    user._qb = qb;
    return user;
}

/**
 * Returns a chainable thenable that mimics Objection's QueryBuilder. Chain
 * methods (findById, findOne, where, withGraphFetched, throwIfNotFound)
 * return the qb itself; awaiting the qb resolves to qb._resolveTo (default
 * undefined). Terminal operations (patch, insertAndFetch, delete, ...) are
 * individual sinon stubs you can configure per-test.
 *
 * Set the terminal value for "await qb" chains with qb.resolves(value).
 */
function mockQueryBuilder() {
    var qb = {};
    qb._resolveTo = undefined;
    qb._reject = undefined;
    qb.findById = sinon.stub().returns(qb);
    qb.findOne = sinon.stub().returns(qb);
    qb.where = sinon.stub().returns(qb);
    qb.withGraphFetched = sinon.stub().returns(qb);
    qb.throwIfNotFound = sinon.stub().returns(qb);
    qb.patch = sinon.stub().resolves(1);
    qb.patchAndFetch = sinon.stub().resolves(undefined);
    qb.insert = sinon.stub().resolves(undefined);
    qb.insertAndFetch = sinon.stub().resolves(undefined);
    qb.delete = sinon.stub().resolves(1);
    qb.then = function (onFulfilled, onRejected) {
        if (qb._reject) return Promise.reject(qb._reject).then(onFulfilled, onRejected);
        return Promise.resolve(qb._resolveTo).then(onFulfilled, onRejected);
    };
    qb.catch = function (onRejected) { return qb.then(undefined, onRejected); };
    qb.resolves = function (v) { qb._resolveTo = v; return qb; };
    qb.rejects = function (e) { qb._reject = e; return qb; };
    return qb;
}

module.exports = { mockReq, mockRes, mockUser, mockQueryBuilder };
