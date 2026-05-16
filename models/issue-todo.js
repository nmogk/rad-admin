var Model = require('../config/objection');

class IssueTodo extends Model {
    static get tableName() { return 'issue_todos'; }

    static get relationMappings() {
        var Periodical = require('./periodical');
        var User = require('./user');
        return {
            periodical: {
                relation: Model.BelongsToOneRelation,
                modelClass: Periodical,
                join: { from: 'issue_todos.periodical_id', to: 'periodicals.id' }
            },
            editor: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: { from: 'issue_todos.editor_id', to: 'users.id' }
            }
        };
    }

    $beforeInsert() { this.updated_at = new Date(); }
    $beforeUpdate() { this.updated_at = new Date(); }
}

module.exports = IssueTodo;
