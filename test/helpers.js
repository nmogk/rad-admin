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
        connection: { encrypted: false },
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
 * Creates a mock Bookshelf user model with get() support.
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
    var data = Object.assign(defaults, attrs);

    return {
        id: data.id,
        get: sinon.stub().callsFake(function (key) { return data[key]; }),
        set: sinon.stub().callsFake(function (key, val) {
            if (typeof key === 'object') {
                Object.assign(data, key);
            } else {
                data[key] = val;
            }
        }),
        save: sinon.stub().resolves(this),
        destroy: sinon.stub().resolves(),
        fetch: sinon.stub().resolves(this),
        authenticate: sinon.stub().resolves(this),
        related: sinon.stub().returns(this),
        _data: data
    };
}

module.exports = { mockReq, mockRes, mockUser };
