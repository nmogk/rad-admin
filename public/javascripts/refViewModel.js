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

    this.cache = function() {};

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

        this.author(htmlDecode(data.author));
        this.title(htmlDecode(data.title));
        this.date(htmlDecode(data.dt));
        this.reference(htmlDecode(data.reference));
        this.source(htmlDecode(data.source));
        this.page(htmlDecode(data.page));
        this.abst(htmlDecode(data.abstract));
        this.id(htmlDecode(data.id));
        this.year(htmlDecode(data.year));
        this.colId = data.colId || "collapse" + Math.random().toString(36).substring(2, 8); // Needed to associate header and collapse
        this.ariaLab = data.ariaLab || "reshead" + Math.random().toString(36).substring(2, 8);

        this.cache.latestData = data;
    },
    revert: function () {
        this.update(this.cache.latestData);
    },
    commit: function () {
        this.cache.latestData = ko.toJS(this);
    },
    holdOver: function () {
        this.author(null);
        this.title(null);
        this.page(null);
        this.abst(null);        
        this.id(null);    
    },
    blank: function () {
        this.holdOver();
        this.date(null);
        this.reference(null);
        this.source(null);
        this.year(null);
    }
});

/**
 * Custom binding which supplies a default value (em dash) for observables with undefined values
 */
ko.bindingHandlers.textPretty = {
    update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
        var value = valueAccessor();
        var text = ko.unwrap(value) || "\u2014";
        ko.bindingHandlers.text.update(element, function() { return text; });
    }
}