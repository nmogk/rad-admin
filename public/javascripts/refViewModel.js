function RefViewModel(data) {
    "use strict";
    var self = this;

    self.author = ko.observable();
    self.title = ko.observable();
    self.date = ko.observable();
    self.reference = ko.observable();
    self.source = ko.observable();
    self.publisher = ko.observable();
    self.hasSeparateSource = ko.observable(false);
    self.page = ko.observable();
    self.type = ko.observable();
    self.abst = ko.observable();
    self.rev_author = ko.observable();
    self.rev_title = ko.observable();
    self.rev_source = ko.observable();
    self.rev_date = ko.observable();
    self.id = ko.observable();
    self.year = ko.observable();
    self.colId = undefined;
    self.ariaLab = undefined;

    self.pageTitle = ko.pureComputed(function () {
        return (/(DVD|CD|cassette)/i.test(this.reference()||"") ? "Run Time" : "Page")
    }, self);

    self.isReview = ko.pureComputed(function () {
        return this.type() === 'reviews';
    }, self);

    this.cache = function() {};

    this.update(data);

    // Opens a modal dialog with the source information
    self.sourceModal = function () {
        ko.cleanNode($("#sourceModal")[0]) // Must clear bindings in newer version of KO
        ko.applyBindings(new SourceViewModel(self.source()), $("#sourceModal")[0]); // AJAX call is done in SourceViewModel constructor
        initBootstrapWidgets("#sourceModal");
        bsModalShow("#sourceModal");
    };

    self.publisherModal = function () {
        ko.cleanNode($("#sourceModal")[0])
        ko.applyBindings(new SourceViewModel(self.publisher()), $("#sourceModal")[0]);
        initBootstrapWidgets("#sourceModal");
        bsModalShow("#sourceModal");
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
        this.publisher(htmlDecode(data.publisher));
        this.hasSeparateSource(!!(data.source && data.source !== data.publisher));
        this.page(htmlDecode(data.page));
        this.type(htmlDecode(data.type) || '');
        this.abst(htmlDecode(data.abstract));
        this.rev_author(htmlDecode(data.rev_author));
        this.rev_title(htmlDecode(data.rev_title));
        this.rev_source(htmlDecode(data.rev_source));
        this.rev_date(htmlDecode(data.rev_date));
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
        this.rev_author(null);
        this.rev_title(null);
        this.rev_source(null);
        this.rev_date(null);
        this.id(null);
    },
    blank: function () {
        this.holdOver();
        this.date(null);
        this.reference(null);
        this.source(null);
        this.publisher(null);
        this.hasSeparateSource(false);
        this.type('');
        this.rev_author(null);
        this.rev_title(null);
        this.rev_source(null);
        this.rev_date(null);
        this.year(null);
    }
});

// textPretty binding is defined in utils.js