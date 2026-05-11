var expect = require('chai').expect;
var proxyquire = require('proxyquire').noCallThru();
var bcrypt = require('bcrypt');

// Load the User model without binding knex (config/database expects mysql creds
// from .env; we don't want a real DB for unit tests). The objection.js shim
// returns Model so models can call `class extends Model` — we substitute a
// no-op database that never gets called.
var User = proxyquire('../models/user', {
    '../config/objection': proxyquire('../config/objection', {
        './database': {} // unused: hooks below are exercised directly, no query() runs
    })
});

describe('User model', function () {
    this.timeout(5000); // bcrypt at 12 rounds is ~100ms per hash; give some headroom

    describe('$beforeInsert', function () {
        it('hashes a plaintext password into password_digest', async function () {
            var user = User.fromJson({ email: 'a@b.com', password: 'plaintext' }, { skipValidation: true });
            await user.$beforeInsert({});

            expect(user.password_digest).to.be.a('string');
            expect(user.password_digest).to.not.equal('plaintext');
            expect(user.password).to.be.undefined;
            expect(await bcrypt.compare('plaintext', user.password_digest)).to.be.true;
        });

        it('is a no-op when no password is present', async function () {
            var user = User.fromJson({ email: 'a@b.com' }, { skipValidation: true });
            await user.$beforeInsert({});

            expect(user.password_digest).to.be.undefined;
            expect(user.password).to.be.undefined;
        });
    });

    describe('$beforeUpdate', function () {
        it('re-hashes when password is in the patch payload', async function () {
            var patch = User.fromJson({ password: 'newpass' }, { skipValidation: true });
            await patch.$beforeUpdate({}, {});

            expect(patch.password_digest).to.be.a('string');
            expect(patch.password).to.be.undefined;
            expect(await bcrypt.compare('newpass', patch.password_digest)).to.be.true;
        });

        it('leaves the row alone when patching unrelated fields', async function () {
            var patch = User.fromJson({ name: 'New Name' }, { skipValidation: true });
            await patch.$beforeUpdate({}, {});

            expect(patch.name).to.equal('New Name');
            expect(patch.password_digest).to.be.undefined;
        });
    });

    describe('authenticate', function () {
        it('resolves with the user when the password matches', async function () {
            var digest = await bcrypt.hash('correct', 4);
            var user = User.fromJson({ email: 'a@b.com', password_digest: digest }, { skipValidation: true });
            var result = await user.authenticate('correct');
            expect(result).to.equal(user);
        });

        it('rejects when the password does not match', async function () {
            var digest = await bcrypt.hash('correct', 4);
            var user = User.fromJson({ email: 'a@b.com', password_digest: digest }, { skipValidation: true });
            var rejected = false;
            try {
                await user.authenticate('wrong');
            } catch (err) {
                rejected = true;
            }
            expect(rejected, 'authenticate should reject on mismatch').to.be.true;
        });
    });
});
