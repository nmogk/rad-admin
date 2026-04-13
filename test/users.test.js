var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var { mockReq, mockRes } = require('./helpers');

var fakeUsers = [
    { id: 1, email: 'admin@test.com', name: 'Admin', permission: 2, validated: 1, last_login: '2026-04-10T12:00:00Z' },
    { id: 2, email: 'editor@test.com', name: 'Editor', permission: 0, validated: 1, last_login: null }
];

var userModels = fakeUsers.map(function (u) {
    return {
        get: function (key) { return u[key]; }
    };
});

var UserStub = function () {};
UserStub.fetchAll = sinon.stub().resolves({ models: userModels });

var mailStub = { sendInviteMail: sinon.stub().resolves() };
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
