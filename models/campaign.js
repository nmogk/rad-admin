var Model = require('../config/objection');

// `refs` is stored as JSON in a longtext column. $parseDatabaseJson runs on rows
// coming out of the DB, $formatDatabaseJson runs before they go in — so the rest
// of the app only ever sees an array of numeric reference IDs.
class Campaign extends Model {
    static get tableName() { return 'campaigns'; }

    $parseDatabaseJson(json) {
        json = super.$parseDatabaseJson(json);
        if (json && typeof json.refs === 'string') {
            try { json.refs = JSON.parse(json.refs); } catch (e) { json.refs = []; }
        }
        return json;
    }

    $formatDatabaseJson(json) {
        json = super.$formatDatabaseJson(json);
        if (json && Array.isArray(json.refs)) {
            json.refs = JSON.stringify(json.refs);
        }
        return json;
    }
}

module.exports = Campaign;
