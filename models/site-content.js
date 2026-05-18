var Model = require('../config/objection');

// In-memory cache of every row. Site content is admin-edited rarely but
// read on every public home-page render, so we serve the public path from
// this cache and have the write routes call invalidateCache() to flush.
var _cache = null;

class SiteContent extends Model {
    static get tableName() { return 'site_content'; }

    static async all() {
        if (_cache === null) {
            _cache = await SiteContent.query();
        }
        return _cache;
    }

    static invalidateCache() {
        _cache = null;
    }
}

module.exports = SiteContent;
