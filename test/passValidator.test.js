var expect = require('chai').expect;
var validator = require('../config/passValidator');

describe('Password Validator', function () {

    describe('valid passwords', function () {
        it('should accept a strong password with mixed case and digits', function () {
            expect(validator.validate('SecurePass1')).to.be.true;
        });

        it('should accept exactly 9 characters', function () {
            expect(validator.validate('Abcdefg1h')).to.be.true;
        });

        it('should accept 72 characters (bcrypt max)', function () {
            var pass = 'A1' + 'a'.repeat(70);
            expect(validator.validate(pass)).to.be.true;
        });
    });

    describe('too short', function () {
        it('should reject fewer than 9 characters', function () {
            expect(validator.validate('Short1A')).to.be.false;
        });

        it('should reject 8 characters', function () {
            expect(validator.validate('Abcdef1g')).to.be.false;
        });

        it('should reject empty string', function () {
            expect(validator.validate('')).to.be.false;
        });
    });

    describe('too long', function () {
        it('should reject more than 72 characters', function () {
            var pass = 'A1' + 'a'.repeat(71);
            expect(validator.validate(pass)).to.be.false;
        });
    });

    describe('missing character types', function () {
        it('should reject without uppercase', function () {
            expect(validator.validate('lowercase1only')).to.be.false;
        });

        it('should reject without lowercase', function () {
            expect(validator.validate('UPPERCASE1ONLY')).to.be.false;
        });

        it('should reject without digits', function () {
            expect(validator.validate('NoDigitsHere')).to.be.false;
        });
    });

    describe('spaces', function () {
        it('should reject passwords with spaces', function () {
            expect(validator.validate('Has Space 1A')).to.be.false;
        });
    });
});
