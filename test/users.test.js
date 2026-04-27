var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var fakeUsers = [
    { id: 1, email: 'admin@test.com', name: 'Admin', permission: 2, validated: 1, last_login: '2026-04-10T12:00:00Z' },
    { id: 2, email: 'editor@test.com', name: 'Editor', permission: 0, validated: 1, last_login: null }
];

var userModels = fakeUsers.map(function (u) {
    return {
        get: function (key) { return u[key]; }
    };
});

var destroyStub = sinon.stub().resolves();
var fetchedUser = {
    id: 5,
    get: sinon.stub().returns('test@example.com'),
    set: sinon.stub().returnsThis(),
    save: sinon.stub().resolves(),
    destroy: destroyStub
};

var savedUser = { id: 9, get: sinon.stub().returns('new@example.com') };
var saveInsertStub = sinon.stub().resolves(savedUser);

var UserStub = function (attrs) {
    // /invite uses `new User({email, password}).save(null, {method: "insert"})`;
    // every other route fetches by id.
    if (attrs && attrs.password) {
        return { save: saveInsertStub };
    }
    return { fetch: sinon.stub().resolves(fetchedUser) };
};
UserStub.fetchAll = sinon.stub().resolves({ models: userModels });
UserStub.NoRowsUpdatedError = class NoRowsUpdatedError extends Error {};
UserStub.NotFoundError = class NotFoundError extends Error {};

class MailErrorStub extends Error {
    constructor(message, cause) { super(message); this.name = 'MailError'; this.cause = cause; }
}
var mailStub = {
    sendInviteMail: sinon.stub().resolves(),
    MailError: MailErrorStub
};
var tokensStub = {
    getToken: sinon.stub().resolves({ get: sinon.stub(), set: sinon.stub().returnsThis(), save: sinon.stub().resolves() }),
    clearRelated: sinon.stub().resolves(),
    randomHexString: sinon.stub().returns('abc123')
};
var inviteStub = function () {};

var usersRouter = proxyquire('../routes/users', {
    '../models/user': UserStub,
    '../config/mailer': mailStub,
    '../models/tokens': tokensStub,
    '../models/invitations': inviteStub
});

describe('Users Routes', function () {

    beforeEach(function () {
        destroyStub.resetHistory();
        mailStub.sendInviteMail = sinon.stub().resolves();
        saveInsertStub.resetHistory();
        saveInsertStub.resolves(savedUser);
    });

    function flush() { return new Promise(function (r) { setImmediate(r); }); }

    describe('GET /', function () {

        it('should pass currentUserId in replacements', function () {
            var user = mockUser({ id: 7, permission: 2 });
            var req = mockReq({ user: user, replacements: {} });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'get', '/');
            handler(req, res, next);

            expect(res.render.calledOnce).to.be.true;
            expect(req.replacements.currentUserId).to.equal(7);
        });
    });

    describe('GET /all', function () {

        it('should return all users as JSON with last_login field', function (done) {
            var req = mockReq();
            var res = mockRes();
            res.jsonp = sinon.stub().callsFake(function (data) {
                expect(data).to.have.lengthOf(2);
                expect(data[0]).to.have.property('last_login', '2026-04-10T12:00:00Z');
                expect(data[1]).to.have.property('last_login', null);
                expect(data[0]).to.have.property('email', 'admin@test.com');
                expect(data[0]).to.have.property('permission', 2);
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'get', '/all');
            handler(req, res, next);
        });
    });

    describe('POST /invite', function () {

        it('should flash the SES detail and not say "resending" when mail send fails', async function () {
            mailStub.sendInviteMail = sinon.stub().rejects(
                new MailErrorStub('Email address is not verified with the sending service. ' +
                    'Email address is not verified. The following identities failed the check in region US-EAST-1: invitee@unverified.test')
            );
            var req = mockReq({
                method: 'POST',
                body: { newUserEmail: 'invitee@unverified.test' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'post', '/invite');
            handler(req, res, next);
            await flush(); await flush(); await flush();

            var flashCall = req.flash.getCalls().find(function (c) { return c.args[0] === 'error'; });
            expect(flashCall, 'an error flash should be set').to.exist;
            expect(flashCall.args[1]).to.match(/^Invitation not sent\./);
            expect(flashCall.args[1]).to.include('not verified');
            expect(flashCall.args[1]).to.not.include('resending');
        });

        it('should flash a generic invitation message for non-mail failures', async function () {
            saveInsertStub.rejects(new Error('db blew up'));
            var req = mockReq({
                method: 'POST',
                body: { newUserEmail: 'invitee@example.com' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'post', '/invite');
            handler(req, res, next);
            await flush(); await flush(); await flush();

            var flashCall = req.flash.getCalls().find(function (c) { return c.args[0] === 'error'; });
            expect(flashCall, 'an error flash should be set').to.exist;
            expect(flashCall.args[1]).to.equal('Problem creating invitation.');
        });
    });

    describe('POST /resend/:id', function () {

        it('should flash the SES detail when mail send fails', async function () {
            mailStub.sendInviteMail = sinon.stub().rejects(
                new MailErrorStub('Email address is not verified with the sending service. ' +
                    'Email address is not verified.')
            );
            var req = mockReq({
                method: 'POST',
                params: { id: '5' },
                body: {},
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'post', '/resend/:id(\\d+)');
            handler(req, res, next);
            await flush(); await flush(); await flush();

            var flashCall = req.flash.getCalls().find(function (c) { return c.args[0] === 'error'; });
            expect(flashCall, 'an error flash should be set').to.exist;
            expect(flashCall.args[1]).to.match(/^Invitation not resent\./);
            expect(flashCall.args[1]).to.include('not verified');
        });
    });

    describe('DELETE /:id', function () {

        it('should call req.logout on self-delete', function (done) {
            var logoutStub = sinon.stub().callsFake(function (cb) { cb(); });
            var user = mockUser({ id: 5, permission: 2 });
            var req = mockReq({
                user: user,
                params: { id: '5' },
                flash: sinon.stub(),
                logout: logoutStub
            });
            var res = mockRes();
            res.json = sinon.stub().callsFake(function (data) {
                expect(logoutStub.calledOnce).to.be.true;
                expect(data.redirect).to.equal('/login');
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'delete', '/:id(\\d+)');
            handler(req, res, next);
        });

        it('should not logout when deleting a different user', function (done) {
            var logoutStub = sinon.stub();
            var user = mockUser({ id: 99, permission: 2 });
            var req = mockReq({
                user: user,
                params: { id: '5' },
                flash: sinon.stub(),
                logout: logoutStub
            });
            var res = mockRes();
            res.json = sinon.stub().callsFake(function (data) {
                expect(logoutStub.called).to.be.false;
                expect(data.redirect).to.equal('/users');
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'delete', '/:id(\\d+)');
            handler(req, res, next);
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
