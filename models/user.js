var Model = require('../config/objection');
var bcrypt = require('bcrypt');

var BCRYPT_ROUNDS = 12;

class User extends Model {
    static get tableName() { return 'users'; }

    async $beforeInsert(context) {
        await super.$beforeInsert(context);
        await hashPasswordIfPresent(this);
    }

    async $beforeUpdate(opt, context) {
        await super.$beforeUpdate(opt, context);
        await hashPasswordIfPresent(this);
    }

    async authenticate(plain) {
        var ok = await bcrypt.compare(plain, this.password_digest);
        if (!ok) throw new Error('Invalid password');
        return this;
    }
}

async function hashPasswordIfPresent(instance) {
    if (instance.password) {
        instance.password_digest = await bcrypt.hash(instance.password, BCRYPT_ROUNDS);
        delete instance.password;
    }
}

module.exports = User;
