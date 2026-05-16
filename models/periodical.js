var Model = require('../config/objection');

class Periodical extends Model {
    static get tableName() { return 'periodicals'; }

    static get relationMappings() {
        var IssueTodo = require('./issue-todo');
        return {
            issues: {
                relation: Model.HasManyRelation,
                modelClass: IssueTodo,
                join: { from: 'periodicals.id', to: 'issue_todos.periodical_id' }
            }
        };
    }

    $beforeInsert() { this.updated_at = new Date(); }
    $beforeUpdate() { this.updated_at = new Date(); }
}

module.exports = Periodical;
