function CampaignViewModel(data) {
    "use strict";
    var self = this;

    self.id = ko.observable();
    self.name = ko.observable();
    self.description = ko.observable();
    self.refs = ko.observableArray([]);
    self.colId = undefined;
    self.ariaLab = undefined;

    self.refCount = ko.pureComputed(function () {
        return (self.refs() || []).length;
    });

    // First line / first 120 chars, used in the collapsed-row view so long
    // descriptions don't blow up the row height.
    self.descriptionPreview = ko.pureComputed(function () {
        var d = self.description();
        if (!d) { return ""; }
        var firstLine = String(d).split(/\r?\n/)[0];
        return firstLine.length > 120 ? firstLine.substring(0, 117) + "…" : firstLine;
    });

    this.cache = function () {};
    this.update(data || {});
}

ko.utils.extend(CampaignViewModel.prototype, {
    update: function (data) {
        this.id(data.id);
        this.name(data.name);
        this.description(data.description);
        this.refs((data.refs || []).slice());
        this.colId = data.colId || "campaign-collapse-" + Math.random().toString(36).substring(2, 8);
        this.ariaLab = data.ariaLab || "campaign-head-" + Math.random().toString(36).substring(2, 8);
        this.cache.latestData = data;
    },
    revert: function () {
        if (this.cache.latestData) { this.update(this.cache.latestData); }
    },
    commit: function () {
        this.cache.latestData = ko.toJS(this);
    },
    blank: function () {
        this.id(null);
        this.name(null);
        this.description(null);
        this.refs([]);
    }
});
