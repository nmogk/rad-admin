/**
 * Populates an object with the parameters of the query string
 */
function parseQuery(){
    "use strict";
    var queryString = {};
    window.location.search.replace(
        new RegExp("([^?=&]+)(=([^&]*))?", "g"), // Splits query string capture group $1 contains each key, $3 each value
        function ($0, $1, $2, $3) {
            queryString[$1] = $3;
        }
    );
    return queryString;
}

/**
 * References are stored as objects whose fields are knockout observables. This function gets the
 * values of a subset of those fields in to a regular object for easier manipulation.
 */
function unpackRef(ref) {
    "use strict";
    return {author: ref.author(), title: ref.title(), reference: ref.reference(), page: ref.page(), source: ref.source(), date: ref.date(), "abstract": ref.abst(), year: ref.year()};
}

/**
 * Decodes an html escaped string into a regular string with special characters.
 */
function htmlDecode(value) {
    "use strict";
    return $("<textarea/>").html(value).text();
}