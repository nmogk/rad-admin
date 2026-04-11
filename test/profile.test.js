var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes, mockUser } = require('./helpers');

var validatorStub = { validate: sinon.stub() };
var mailStub = { sendPassChangeConfirmation: sinon.stub().resolves() };
var tokensStub = { clearRelated: sinon.stub().resolves() };

var profileRouter = proxyquire('../routes/profile', {
    '../config/passValidator': validatorStub,
    '../config/mailer': mailStub,
    '../models/tokens': tokensStub,
    'bluebird': require('bluebird')
});

describe('Profile Routes', function () {

    beforeEach(function () {
        validatorStub.validate.reset();
        mailStub.sendPassChangeConfirmation.reset();
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
