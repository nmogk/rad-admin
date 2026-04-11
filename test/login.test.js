var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes } = require('./helpers');

// Stub passport to avoid database/strategy initialization
var passportStub = {
    authenticate: sinon.stub().returns(function (req, res, next) { next(); })
};

// Stub mail to avoid AWS SES initialization
var mailStub = {
    sendResetMail: sinon.stub().resolves()
};

// Stub token module
var tokenStub = {
    getToken: sinon.stub(),
    clearRelated: sinon.stub()
};

// Stub User model
var fetchStub = sinon.stub();
var UserStub = function (attrs) {
    this.attrs = attrs;
    this.fetch = fetchStub;
    this.get = function (key) { return attrs[key]; };
    this.id = attrs.id || 1;
};
UserStub.NotFoundError = class NotFoundError extends Error {};

// Stub log4js
var log4jsStub = {
    getLogger: sinon.stub().returns({
        info: sinon.stub(),
        debug: sinon.stub(),
        err: sinon.stub()
    })
};

var loginRouter = proxyquire('../routes/login', {
    '../config/passport': passportStub,
    '../config/mailer': mailStub,
    '../models/user': UserStub,
    '../models/invitations': function () {},
    '../models/tokens': tokenStub,
    'bluebird': require('bluebird'),
    'log4js': log4jsStub
});

describe('Login Routes', function () {

    describe('GET /', function () {

        it('should render the login page', function () {
            var req = mockReq({
                flash: sinon.stub().returns([])
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(loginRouter, 'get', '/');
            handler(req, res, next);

            expect(res.render.calledOnce).to.be.true;
            expect(res.render.firstCall.args[0]).to.equal('login');
        });

        it('should pass flash messages to the template', function () {
            var req = mockReq({
                flash: sinon.stub().returns(['Invalid credentials'])
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(loginRouter, 'get', '/');
            handler(req, res, next);

            expect(res.render.firstCall.args[1]).to.have.property('errorMessage');
        });
    });
});

function findHandler(router, method, path) {
    var layer = router.stack.find(function (l) {
        return l.route &&
            l.route.path === path &&
            l.route.methods[method];
    });
    if (!layer) {
        throw new Error('No handler found for ' + method.toUpperCase() + ' ' + path);
    }
    return layer.route.stack[0].handle;
}
