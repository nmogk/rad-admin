// Citation formatting for the saved-references aggregator (#93) and the
// per-result citation modal. One source of truth so a tweak to a style
// (e.g. fixing punctuation) only needs editing in one place.
//
// Each format function takes the flat ref shape produced by unpackRef()
// in index.js — { author, title, reference, page, source, publisher,
// date, abstract, year } — and returns an HTML string. Consumers must
// use Knockout's `html` binding (not `text`) to render. User input is
// HTML-escaped before interpolation; only the `<i>` wrappers around the
// reference field are intentional markup.

(function () {
    "use strict";

    window.RAD = window.RAD || {};

    function escape(s) {
        if (s === undefined || s === null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ko.unwrap lets us accept either a Knockout observable (the modal
    // binds to a RefViewModel whose fields are observables) or a plain
    // value (the aggregator stores flat objects in localStorage).
    function read(v) {
        return (window.ko && ko.unwrap) ? ko.unwrap(v) : v;
    }

    function pick(ref) {
        if (!ref) return { author: '', title: '', reference: '', page: '', year: '' };
        return {
            author:    escape(read(ref.author)),
            title:     escape(read(ref.title)),
            reference: escape(read(ref.reference)),
            page:      escape(read(ref.page)),
            year:      escape(read(ref.year))
        };
    }

    var formatters = {
        crsq: function (ref) {
            var r = pick(ref);
            return r.author + '. ' + r.year + '. ' + r.title + '. <i>' + r.reference + '</i>:' + r.page + '.';
        },
        arj: function (ref) {
            var r = pick(ref);
            return r.author + '. ' + r.year + '. &quot;' + r.title + '.&quot; <i>' + r.reference + '</i>:' + r.page + '.';
        },
        joc: function (ref) {
            var r = pick(ref);
            return r.author + ', ' + r.title + ', <i>' + r.reference + '</i>:' + r.page + ', ' + r.year + '.';
        },
        mla: function (ref) {
            var r = pick(ref);
            return r.author + '. &quot;' + r.title + '.&quot; <i>' + r.reference + '</i>, p.p. ' + r.page + '.';
        },
        apa: function (ref) {
            var r = pick(ref);
            return r.author + '. (' + r.year + '). ' + r.title + '. <i>' + r.reference + '</i>, ' + r.page + '.';
        },
        chicago: function (ref) {
            var r = pick(ref);
            return r.author + '. &quot;' + r.title + '.&quot; <i>' + r.reference + '</i> (' + r.year + '): ' + r.page + '.';
        }
    };

    window.RAD.citations = {
        // Ordered for picker display; preserves the modal's historical order.
        styles: [
            { id: 'crsq',    label: 'CRSQ/ICC' },
            { id: 'arj',     label: 'ARJ' },
            { id: 'joc',     label: 'JoC' },
            { id: 'mla',     label: 'MLA' },
            { id: 'apa',     label: 'APA' },
            { id: 'chicago', label: 'Chicago' }
        ],
        format: function (styleId, ref) {
            var fn = formatters[styleId];
            return fn ? fn(ref) : '';
        }
    };
}());
