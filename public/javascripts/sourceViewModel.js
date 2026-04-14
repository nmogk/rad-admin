/**
 * View model for source information. Sources are kept in a separate index which is searched when
 * needed.
 * @param name - name of reference to query
 */
function SourceViewModel(name) {
    "use strict";
    var self = this;

    // Process Solr field values: handle null, arrays, and plain strings
    self.refP = function (field) {
        if (field === undefined || field === null) {
            return "\u2014";
        }
        if (Array.isArray(field)) {
            return htmlDecode(field.join(", "));
        }
        return htmlDecode(String(field));
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
        url: "/solr/source/select?",
        dataType: "json",
        data: $.param({"q": name}),
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