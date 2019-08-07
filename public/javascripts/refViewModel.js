function RefViewModel(data) {
    "use strict";
    var self = this;

    self.author = ko.observable();
    self.title = ko.observable();
    self.date = ko.observable();
    self.reference = ko.observable();
    self.source = ko.observable();
    self.page = ko.observable();
    self.abst = ko.observable();
    self.id = ko.observable();
    self.year = ko.observable();
    self.colId = undefined;
    self.ariaLab = undefined;

    self.pageTitle = ko.pureComputed(function () {
        return (/(DVD|CD|cassette)/i.test(this.reference()||"") ? "Run Time" : "Page")
    }, self);

    this.update(data);

    // Opens a modal dialog with the source information
    self.sourceModal = function () {
        ko.cleanNode($("#sourceModal")[0]) // Must clear bindings in newer version of KO
        ko.applyBindings(new SourceViewModel(self.source()), $("#sourceModal")[0]); // AJAX call is done in SourceViewModel constructor
        $("#sourceModal").modal("show");
    };
}

// See www.knockmeout.net/2013/01/simple-editor-pattern-knockout-js.html for pattern implementation
ko.utils.extend(RefViewModel.prototype, {
    update: function (data) {

        // Ref process, take care of null values
        function refP(field) {
            if (field === undefined) {
                return "\u2014";
            }
            return htmlDecode(field);
        };

        this.author(refP(data.author));
        this.title(refP(data.title));
        this.date(refP(data.dt));
        this.reference(refP(data.reference));
        this.source(refP(data.source));
        this.page(refP(data.page));
        this.abst(refP(data.abstract));
        this.id(refP(data.id));
        this.year(refP(data.year));
        this.colId = data.colId || "collapse" + Math.random().toString(36).substring(2, 8); // Needed to associate header and collapse
        this.ariaLab = data.ariaLab || "reshead" + Math.random().toString(36).substring(2, 8);

        this.cache.latestData = data;
    },
    revert: function () {
        this.update(this.cache.latestData);
    },
    commit: function () {
        this.cache.latestData = ko.toJS(this);
    }
});