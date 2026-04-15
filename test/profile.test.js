var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var validatorStub = { validate: sinon.stub() };
var mailStub = {
    sendPassChangeConfirmation: sinon.stub().resolves(),
    sendEmailVerification: sinon.stub().resolves(),
    sendEmailChangeNotice: sinon.stub().resolves()
};
var tokensStub = { clearRelated: sinon.stub().resolves(), getToken: sinon.stub() };

var fakeToken = {
    get: sinon.stub().callsFake(function (key) {
        if (key === 'token') return 'abc123';
    }),
    set: sinon.stub(),
    save: sinon.stub().resolves()
};
fakeToken.set.returns(fakeToken);
tokensStub.getToken.resolves(fakeToken);

var resetTokenStub = sinon.stub();

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
        tokensStub.clearRelated.reset();
        fakeToken.set.resetHistory();
        fakeToken.save.resetHistory();
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

        it('should reject weak passwords submitted via profile update', function () {
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
            handler(req, res, next);

            expect(validatorStub.validate.calledWith('weak')).to.be.true;
            expect(req.flash.calledOnce).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
            expect(user.set.neverCalledWith('password')).to.be.true;
        });

        it('should accept valid passwords submitted via profile update', function () {
            validatorStub.validate.returns(true);
            var user = mockUser();
            user.save = sinon.stub().resolves(user);
            var req = mockReq({
                body: { password: 'StrongPass1' },
                user: user,
                replacements: {}
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            handler(req, res, next);

            expect(user.set.calledWith('password', 'StrongPass1')).to.be.true;
        });

        it('should reject invalid email format', function () {
            var user = mockUser();
            var req = mockReq({
                body: { email: 'notanemail' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            handler(req, res, next);

            expect(req.flash.calledWith('error', 'Please enter a valid email address.')).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
        });

        it('should reject email change to same address', function () {
            var user = mockUser({ email: 'test@example.com' });
            var req = mockReq({
                body: { email: 'test@example.com' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            handler(req, res, next);

            expect(req.flash.calledWith('error', 'New email is the same as current email.')).to.be.true;
            expect(res.redirect.calledWith(303, '/profile')).to.be.true;
        });

        it('should set pending_email and send verification for valid new email', function (done) {
            var user = mockUser({ email: 'old@example.com' });
            user.save = sinon.stub().resolves(user);
            var req = mockReq({
                body: { email: 'new@example.com' },
                user: user,
                flash: sinon.stub(),
                get: sinon.stub().returns('localhost')
            });
            var res = mockRes();
            res.redirect = sinon.stub().callsFake(function () {
                expect(user.set.calledWith('pending_email', 'new@example.com')).to.be.true;
                expect(mailStub.sendEmailVerification.calledOnce).to.be.true;
                expect(mailStub.sendEmailChangeNotice.calledOnce).to.be.true;
                expect(req.flash.calledWith('info', sinon.match('verification email'))).to.be.true;
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/');
            handler(req, res, next);
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

        it('should save password and send confirmation on success', function (done) {
            validatorStub.validate.returns(true);
            var user = mockUser();
            user.save = sinon.stub().resolves(user);
            var req = mockReq({
                body: { password: 'StrongPass1', confirm: 'StrongPass1' },
                user: user,
                flash: sinon.stub()
            });
            var res = mockRes();
            res.redirect = sinon.stub().callsFake(function () {
                expect(user.set.calledWith('password', 'StrongPass1')).to.be.true;
                expect(mailStub.sendPassChangeConfirmation.calledOnce).to.be.true;
                done();
            });
            var next = sinon.spy();

            var handler = findHandler(profileRouter, 'post', '/password');
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
