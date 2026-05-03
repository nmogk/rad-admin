var bookshelf = require('../config/bookshelf');

// `refs` is stored as JSON in a longtext column. parse() runs on rows coming
// out of the DB, format() runs before they go in — so the rest of the app
// only ever sees an array of numeric reference IDs.
var model = bookshelf.Model.extend({
    tableName: 'campaigns',
    parse: function (attrs) {
        if (attrs && typeof attrs.refs === 'string') {
            try { attrs.refs = JSON.parse(attrs.refs); } catch (e) { attrs.refs = []; }
        }
        return attrs;
    },
    format: function (attrs) {
        if (attrs && Array.isArray(attrs.refs)) {
            attrs.refs = JSON.stringify(attrs.refs);
        }
        return attrs;
    }
});

module.exports = model;
