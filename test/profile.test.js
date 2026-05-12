var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser, mockQueryBuilder } = require('./helpers');

var validatorStub = { validate: sinon.stub() };
var mailStub = {
    sendPassChangeConfirmation: sinon.stub().resolves(),
    sendEmailVerification: sinon.stub().resolves(),
    sendEmailChangeNotice: sinon.stub().resolves()
};
var tokensStub = {
    clearRelated: sinon.stub().resolves(),
    getToken: sinon.stub().resolves({ token: 'abc123', expires: new Date('2026-12-31') })
};

var resetTokenQb;
var resetTokenStub = { query: sinon.stub() };

var profileRouter = proxyquire('../routes/profile', {
    '../config/passValidator': validatorStub,
    '../config/mailer': mailStub,
    '../models/tokens': tokensStub,
    '../models/invitations': resetTokenStub
});

describe('Profile Routes', function () {

    beforeEach(function () {
        validatorStub.validate.reset();
        mailStub.sendPassChangeConfirmation.reset();
        mailStub.sendEmailVerification.reset();
        mailStub.sendEmailChangeNotice.reset();
        tokensStub.getToken.resetHistory();
        tokensStub.clearRelated.resetHistory();
        resetTokenQb = mockQueryBuilder();
        resetTokenQb.insertAndFetch.resolves({ token: 'abc123' });
        resetTokenStub.query.reset();
        resetTokenStub.query.returns(resetTokenQb);
    });

    describe('GET /', function () {

        it('should render profile with req.replacements', function () {
            var replacements = { email: 'user@test.com', username: 'User' };
            var req = mockReq({ replacements: replacements });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'get', '/');
            handler(req, res, next);

            expect(res.render.calledWith('profile', replacements)).to.be.true;
        });
    });

    describe('POST / (profile update)', function () {

        it('should reject weak passwords submitted via profile update', async function () {
            validatorStub.validate.returns(false);
            var user = mockUser();
            var req = mockReq({
                body: { password: 'weak' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            await handler(req, res, next);

            expect(validatorStub.validate.calledWith('weak')).to.be.true;
            expect(req.flash.calledOnce).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
            expect(user._qb.patch.called).to.be.false;
        });

        it('should accept valid passwords submitted via profile update', async function () {
            validatorStub.validate.returns(true);
            var user = mockUser();
            var req = mockReq({
                body: { password: 'StrongPass1' },
                user: user,
                replacements: {}
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            await handler(req, res, next);

            expect(user._qb.patch.calledOnce).to.be.true;
            expect(user._qb.patch.firstCall.args[0]).to.deep.equal({ password: 'StrongPass1' });
        });

        it('should reject invalid email format', async function () {
            var user = mockUser();
            var req = mockReq({
                body: { email: 'notanemail' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            await handler(req, res, next);

            expect(req.flash.calledWith('error', 'Please enter a valid email address.')).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
        });

        it('should reject email change to same address', async function () {
            var user = mockUser({ email: 'test@example.com' });
            var req = mockReq({
                body: { email: 'test@example.com' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            await handler(req, res, next);

            expect(req.flash.calledWith('error', 'New email is the same as current email.')).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
        });

        it('should set pending_email and send verification for valid new email', async function () {
            var user = mockUser({ email: 'old@example.com' });
            var req = mockReq({
                body: { email: 'new@example.com' },
                user: user,
                flash: sinon.stub(),
                get: sinon.stub().returns('localhost')
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            await handler(req, res, next);

            expect(user._qb.patch.calledOnce).to.be.true;
            expect(user._qb.patch.firstCall.args[0]).to.deep.equal({ pending_email: 'new@example.com' });
            expect(mailStub.sendEmailVerification.calledOnce).to.be.true;
            expect(mailStub.sendEmailChangeNotice.calledOnce).to.be.true;
            expect(req.flash.calledWith('info', sinon.match('verification email'))).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
        });
    });

    describe('POST /password', function () {

        it('should reject mismatched passwords', function () {
            var req = mockReq({
                body: { password: 'NewPass1abc', confirm: 'Different1abc' },
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/password');
            handler(req, res, next);

            expect(req.flash.calledWith('error', 'Passwords do not match.')).to.be.true;
            expect(res.redirect.calledWith(303, 'back')).to.be.true;
        });

        it('should reject weak passwords', function () {
            validatorStub.validate.returns(false);
            var req = mockReq({
                body: { password: 'weak', confirm: 'weak' },
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/password');
            handler(req, res, next);

            expect(validatorStub.validate.calledWith('weak')).to.be.true;
            expect(req.flash.calledOnce).to.be.true;
            expect(res.redirect.calledWith(303, 'back')).to.be.true;
        });

        it('should save password and send confirmation on success', async function () {
            validatorStub.validate.returns(true);
            var user = mockUser();
            var req = mockReq({
                body: { password: 'StrongPass1', confirm: 'StrongPass1' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/password');
            await handler(req, res, next);

            expect(user._qb.patch.calledOnce).to.be.true;
            expect(user._qb.patch.firstCall.args[0]).to.deep.equal({ password: 'StrongPass1' });
            expect(mailStub.sendPassChangeConfirmation.calledOnce).to.be.true;
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
