var expect = require('chai').expect;
var sinon = require('sinon');
var { mockReq, mockRes, mockUser } = require('./helpers');
var { isLoggedIn, flashMessageCenter, forceSsl, superuser } = require('../server/middleware');

describe('Middleware', function () {

    describe('isLoggedIn', function () {

        it('should call next() when user is authenticated', function () {
            var user = mockUser({ permission: 0 });
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(true),
                user: user
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(res.redirect.called).to.be.false;
        });

        it('should populate req.replacements with user context', function () {
            var user = mockUser({ email: 'admin@test.com', name: 'Admin', permission: 2 });
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(true),
                user: user
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(req.replacements.email).to.equal('admin@test.com');
            expect(req.replacements.dispname).to.equal('Admin');
            expect(req.replacements.username).to.equal('Admin');
            expect(req.replacements.users).to.be.true;
            expect(req.replacements.deletable).to.be.true;
            expect(req.replacements.nav).to.equal(1);
        });

        it('should set username to email when name is null', function () {
            var user = mockUser({ email: 'user@test.com', name: null, permission: 0 });
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(true),
                user: user
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(req.replacements.username).to.equal('user@test.com');
        });

        it('should set users=false for permission < 2', function () {
            var user = mockUser({ permission: 1 });
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(true),
                user: user
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(req.replacements.users).to.be.false;
            expect(req.replacements.deletable).to.be.true;
        });

        it('should set deletable=false for permission 0', function () {
            var user = mockUser({ permission: 0 });
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(true),
                user: user
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(req.replacements.deletable).to.be.false;
        });

        it('should redirect to /login when not authenticated', function () {
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(false)
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(next.called).to.be.false;
            expect(res.redirect.calledOnce).to.be.true;
            expect(res.redirect.firstCall.args).to.deep.equal([302, '/login']);
        });

        it('should initialize req.replacements if undefined', function () {
            var user = mockUser();
            var req = mockReq({
                isAuthenticated: sinon.stub().returns(true),
                user: user,
                replacements: undefined
            });
            var res = mockRes();
            var next = sinon.spy();

            isLoggedIn(req, res, next);

            expect(req.replacements).to.be.an('object');
        });
    });

    describe('flashMessageCenter', function () {

        it('should collect flash messages into req.replacements', function () {
            var flashData = {
                error: ['Something went wrong'],
                yay: ['It worked!'],
                info: ['FYI']
            };
            var req = mockReq({
                flash: sinon.stub().callsFake(function (type) { return flashData[type] || []; }),
                replacements: {}
            });
            var res = mockRes();
            var next = sinon.spy();

            flashMessageCenter(req, res, next);

            expect(req.replacements.errorMessage).to.deep.equal(['Something went wrong']);
            expect(req.replacements.yayMessage).to.deep.equal(['It worked!']);
            expect(req.replacements.infoMessage).to.deep.equal(['FYI']);
            expect(next.calledOnce).to.be.true;
        });

        it('should initialize req.replacements if undefined', function () {
            var req = mockReq({ replacements: undefined });
            var res = mockRes();
            var next = sinon.spy();

            flashMessageCenter(req, res, next);

            expect(req.replacements).to.be.an('object');
            expect(next.calledOnce).to.be.true;
        });

        it('should not overwrite existing req.replacements properties', function () {
            var req = mockReq({
                replacements: { email: 'user@test.com' }
            });
            var res = mockRes();
            var next = sinon.spy();

            flashMessageCenter(req, res, next);

            expect(req.replacements.email).to.equal('user@test.com');
        });
    });

    describe('forceSsl', function () {

        it('should pass through for root path', function () {
            var req = mockReq({ path: '/' });
            var res = mockRes();
            var next = sinon.spy();

            forceSsl(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(res.redirect.called).to.be.false;
        });

        it('should pass through for encrypted connections', function () {
            var req = mockReq({
                path: '/refs',
                secure: true
            });
            var res = mockRes();
            var next = sinon.spy();

            forceSsl(req, res, next);

            expect(next.calledOnce).to.be.true;
        });

        it('should redirect to HTTPS for non-root unencrypted requests', function () {
            process.env.HTTPSPORT = '443';
            var req = mockReq({
                path: '/login',
                url: '/login',
                secure: false,
                get: sinon.stub().returns('example.com:80')
            });
            var res = mockRes();
            var next = sinon.spy();

            forceSsl(req, res, next);

            expect(next.called).to.be.false;
            expect(res.redirect.calledOnce).to.be.true;
            expect(res.redirect.firstCall.args[0]).to.equal(308);
            expect(res.redirect.firstCall.args[1]).to.equal('https://example.com:443/login');
        });

        it('should strip port from host header before redirecting', function () {
            process.env.HTTPSPORT = '8443';
            var req = mockReq({
                path: '/refs',
                url: '/refs?q=test',
                secure: false,
                get: sinon.stub().returns('myhost.com:3000')
            });
            var res = mockRes();
            var next = sinon.spy();

            forceSsl(req, res, next);

            expect(res.redirect.firstCall.args[1]).to.equal('https://myhost.com:8443/refs?q=test');
        });

        it('should handle host without port', function () {
            process.env.HTTPSPORT = '443';
            var req = mockReq({
                path: '/profile',
                url: '/profile',
                secure: false,
                get: sinon.stub().returns('example.com')
            });
            var res = mockRes();
            var next = sinon.spy();

            forceSsl(req, res, next);

            expect(res.redirect.firstCall.args[1]).to.equal('https://example.com:443/profile');
        });
    });

    describe('superuser', function () {

        it('should call next() for permission >= 2', function () {
            var user = mockUser({ permission: 2 });
            var req = mockReq({ user: user });
            var res = mockRes();
            var next = sinon.spy();

            superuser(req, res, next);

            expect(next.calledOnce).to.be.true;
        });

        it('should call next() for permission > 2', function () {
            var user = mockUser({ permission: 3 });
            var req = mockReq({ user: user });
            var res = mockRes();
            var next = sinon.spy();

            superuser(req, res, next);

            expect(next.calledOnce).to.be.true;
        });

        it('should redirect to /profile for permission 1', function () {
            var user = mockUser({ permission: 1 });
            var req = mockReq({ user: user });
            var res = mockRes();
            var next = sinon.spy();

            superuser(req, res, next);

            expect(next.called).to.be.false;
            expect(res.redirect.calledWith(302, '/profile')).to.be.true;
        });

        it('should redirect to /profile for permission 0', function () {
            var user = mockUser({ permission: 0 });
            var req = mockReq({ user: user });
            var res = mockRes();
            var next = sinon.spy();

            superuser(req, res, next);

            expect(next.called).to.be.false;
            expect(res.redirect.calledWith(302, '/profile')).to.be.true;
        });
    });
});
