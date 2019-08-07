/**
 * View model for source information. Sources are kept in a separate index which is searched when
 * needed.
 * @param name - name of reference to query
 */
function SourceViewModel(name) {
    "use strict";
    var self = this;

    // Ref process, take care of null values and unbox from arrays
    // Boxing in arrays occurs when fields indexed in Solr are listed as multivalued
    self.refP = function (field) {
        if (field === undefined) {
            return "\u2014";
        }
        return htmlDecode(field.join(", "));
    };

    var dunno = "Searching..."; // AJAX call may take some time, so a temporary message is displayed for all fields

    self.name = ko.observable(name);
    self.phone = ko.observable(dunno);
    self.fax = ko.observable(dunno);
    self.email = ko.observable(dunno);
    self.web = ko.observable(dunno);
    self.street = ko.observable(dunno);
    self.city = ko.observable(dunno);
    self.state = ko.observable(dunno);
    self.zip = ko.observable(dunno);

    self.address = ko.computed( function () {
        if (self.city() === dunno || self.city() === "\u2014") {
            return self.city();
        }
        return self.street() + ", " + self.city() + ", " + self.state() + " " + self.zip();
    });

    $.ajax({
        url: "/solr/source/select?", // solr-proxy running on port 8008
        dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
        jsonp: "json.wrf", // This is the name of the function to return. This is magic sauce. I don't know why Solr requires this name to use jsonp
        data: $.param({"q": name}), // Server on backend is set up to search name field by default... I think
        success: function (data) {
            var find = data.response.docs[0]; // update information to first result
            self.name(self.refP(find.name));
            self.street(self.refP(find.address));
            self.city(self.refP(find.city));
            self.state(self.refP(find.state));
            self.zip(self.refP(find.zip));
            self.phone(self.refP(find.telephone));
            self.fax(self.refP(find.fax));
            self.email(self.refP(find.email));
            self.web(self.refP(find.website));
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
        }
    });
}