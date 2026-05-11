var Model = require('../config/objection');

class SiteContent extends Model {
    static get tableName() { return 'site_content'; }
}

module.exports = SiteContent;
