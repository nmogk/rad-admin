// Canonical list of values allowed in the Solr `type` field on the rad core
// (issue #19). Lowercase strings are stored verbatim in Solr so they can be
// used in exact-match `fq=type:"…"` filters; the labels are what the admin
// editor and public search dropdowns show. Add a new type here — the server
// validates against this list and the templates iterate over it, so no
// other file needs editing.
module.exports = [
    { value: 'technical',  label: 'Technical Articles' },
    { value: 'semi',       label: 'Semi-technical Articles' },
    { value: 'popular',    label: 'Popular Articles' },
    { value: 'book',       label: 'Books' },
    { value: 'review',     label: 'Reviews' },
    { value: 'curriculum', label: 'Curricula' },
    { value: 'media',      label: 'Media' },
    { value: 'software',   label: 'Software' }
];
