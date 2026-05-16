var Model = require('../config/objection');

class GeneralTodo extends Model {
    static get tableName() { return 'general_todos'; }

    static get relationMappings() {
        var User = require('./user');
        return {
            editor: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: { from: 'general_todos.editor_id', to: 'users.id' }
            }
        };
    }

    $beforeInsert() { this.updated_at = new Date(); }
    $beforeUpdate() { this.updated_at = new Date(); }
}

module.exports = GeneralTodo;
