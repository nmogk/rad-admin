// Canonical list of values allowed in the Solr `type` field on the rad core
// (issue #19). Lowercase strings are stored verbatim in Solr so they can be
// used in exact-match `fq=type:"…"` filters; the labels are what the admin
// editor and public search dropdowns show. Add a new type here — the server
// validates against this list and the templates iterate over it, so no
// other file needs editing.
module.exports = [
    { value: 'technical articles', label: 'Technical Articles' },
    { value: 'media',              label: 'Media' },
    { value: 'reviews',            label: 'Reviews' },
    { value: 'popular articles',   label: 'Popular Articles' }
];
