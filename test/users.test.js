var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser, mockQueryBuilder } = require('./helpers');

var fakeUsers = [
    { id: 1, email: 'admin@test.com', name: 'Admin', permission: 2, validated: 1, last_login: '2026-04-10T12:00:00Z' },
    { id: 2, email: 'editor@test.com', name: 'Editor', permission: 0, validated: 1, last_login: null }
];

var userQb;
var inviteQb;
var fetchedUser;
var savedUser;

var UserStub = { query: sinon.stub() };
UserStub.NotFoundError = class NotFoundError extends Error {};

var InviteStub = { query: sinon.stub() };

class MailErrorStub extends Error {
    constructor(message, cause) { super(message); this.name = 'MailError'; this.cause = cause; }
}
var mailStub = {
    sendInviteMail: sinon.stub().resolves(),
    MailError: MailErrorStub
};

var tokensStub = {
    getToken: sinon.stub().resolves({ token: 'invite-token-abc', expires: new Date('2026-12-31') }),
    clearRelated: sinon.stub().resolves(),
    randomHexString: sinon.stub().returns('abc123')
};

var usersRouter = proxyquire('../routes/users', {
    '../models/user': UserStub,
    '../config/mailer': mailStub,
    '../models/tokens': tokensStub,
    '../models/invitations': InviteStub
});

describe('Users Routes', function () {

    beforeEach(function () {
        userQb = mockQueryBuilder();
        inviteQb = mockQueryBuilder();
        fetchedUser = mockUser({ id: 5, email: 'test@example.com' });
        savedUser = mockUser({ id: 9, email: 'new@example.com' });

        UserStub.query.reset();
        UserStub.query.returns(userQb);
        InviteStub.query.reset();
        InviteStub.query.returns(inviteQb);

        // GET /all default: User.query() yields the fake user list.
        userQb.resolves(fakeUsers);

        mailStub.sendInviteMail = sinon.stub().resolves();
        tokensStub.getToken.resetHistory();
        tokensStub.clearRelated.resetHistory();
    });

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

        it('should return all users as JSON with last_login field', async function () {
            var req = mockReq();
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'get', '/all');
            await handler(req, res, next);

            expect(res._json).to.have.lengthOf(2);
            expect(res._json[0]).to.have.property('last_login', '2026-04-10T12:00:00Z');
            expect(res._json[1]).to.have.property('last_login', null);
            expect(res._json[0]).to.have.property('email', 'admin@test.com');
            expect(res._json[0]).to.have.property('permission', 2);
        });
    });

    describe('POST /invite', function () {

        it('should flash the SES detail and not say "resending" when mail send fails', async function () {
            // findOne yields null (no existing user); insertAndFetch yields the new user.
            userQb.resolves(null);
            userQb.insertAndFetch.resolves(savedUser);
            inviteQb.insertAndFetch.resolves({ token: 'invite-token-abc' });
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
            await handler(req, res, next);

            var flashCall = req.flash.getCalls().find(function (c) { return c.args[0] === 'error'; });
            expect(flashCall, 'an error flash should be set').to.exist;
            expect(flashCall.args[1]).to.match(/^Invitation not sent\./);
            expect(flashCall.args[1]).to.include('not verified');
            expect(flashCall.args[1]).to.not.include('resending');
        });

        it('should flash a generic invitation message for non-mail failures', async function () {
            userQb.resolves(null);
            userQb.insertAndFetch.rejects(new Error('db blew up'));
            var req = mockReq({
                method: 'POST',
                body: { newUserEmail: 'invitee@example.com' },
                user: mockUser({ permission: 2 }),
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(usersRouter, 'post', '/invite');
            await handler(req, res, next);

            var flashCall = req.flash.getCalls().find(function (c) { return c.args[0] === 'error'; });
            expect(flashCall, 'an error flash should be set').to.exist;
            expect(flashCall.args[1]).to.equal('Problem creating invitation.');
        });
    });

    describe('POST /resend/:id', function () {

        it('should flash the SES detail when mail send fails', async function () {
            userQb.resolves(fetchedUser);
            inviteQb.insertAndFetch.resolves({ token: 'invite-token-abc' });
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
            await handler(req, res, next);

            var flashCall = req.flash.getCalls().find(function (c) { return c.args[0] === 'error'; });
            expect(flashCall, 'an error flash should be set').to.exist;
            expect(flashCall.args[1]).to.match(/^Invitation not resent\./);
            expect(flashCall.args[1]).to.include('not verified');
        });
    });

    describe('DELETE /:id', function () {

        it('should call req.logout on self-delete', function (done) {
            userQb.resolves(fetchedUser);
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
            userQb.resolves(fetchedUser);
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
