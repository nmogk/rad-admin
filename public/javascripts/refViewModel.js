function RefViewModel(refi, i){
    "use strict";
    var self = this;

    // Ref process, take care of null values
    self.refP = function (field) {
        if (field === undefined) {
            return "\u2014";
        }
        return htmlDecode(field);
    };

    var pageTitle = "Page"; // Most references list how many pages they are
    if (/(DVD|CD|cassette)/i.test(refi.reference)) { // Some references refer to media runtime instead
        pageTitle = "Run Time";
    }

    self.author = ko.observable(self.refP(refi.author));
    self.title = ko.observable(self.refP(refi.title));
    self.date = ko.observable(self.refP(refi.dt));
    self.reference = ko.observable(self.refP(refi.reference));
    self.source = ko.observable(self.refP(refi.source));
    self.page = ko.observable(self.refP(refi.page));
    self.abst = ko.observable(self.refP(refi.abstract));
    self.id = ko.observable(self.refP(refi.id));
    self.year = ko.observable(self.refP(refi.year));
    self.colId = "collapse" + (i + 1); // Needed to associate header and collapse
    self.ariaLab = "reshead" + (i + 1);
    self.pageTitle = pageTitle;

    // Opens a modal dialog with the source information
    self.sourceModal = function () {
        ko.cleanNode($("#sourceModal")[0]) // Must clear bindings in newer version of KO
        ko.applyBindings(new SourceViewModel(self.source()), $("#sourceModal")[0]); // AJAX call is done in SourceViewModel constructor
        $("#sourceModal").modal("show");
    };
}