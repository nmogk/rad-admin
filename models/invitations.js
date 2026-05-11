var Model = require('../config/objection');

class Invitation extends Model {
    static get tableName() { return 'invitations'; }
    static get idColumn() { return 'token'; }

    static get relationMappings() {
        var User = require('./user');
        return {
            user: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: { from: 'invitations.user_id', to: 'users.id' }
            }
        };
    }
}

module.exports = Invitation;
