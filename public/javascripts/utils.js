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


/**
 * Simple view model for formatted citations. Contains all of the basic info fields. Formatting is
 * determined by the html view.
 * @param ref - a simple javascript object which contains the relevant information
 */
function CitationView(ref) {
    "use strict";
    var self = this;

    self.author = ko.observable(ref.author);
    self.title = ko.observable(ref.title);
    self.reference = ko.observable(ref.reference);
    self.source = ko.observable(ref.source);
    self.page = ko.observable(ref.page);
    self.year = ko.observable(ref.year);
}