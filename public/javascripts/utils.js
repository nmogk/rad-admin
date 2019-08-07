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
 * Decodes an html escaped string into a regular string with special characters.
 */
function htmlDecode(value) {
    "use strict";
    return $("<textarea/>").html(value).text();
}