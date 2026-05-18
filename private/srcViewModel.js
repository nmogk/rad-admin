/**
 * View model for a single source record. Maintains observables for each source field
 * and provides edit/commit/revert functionality.
 * @param data - source data object from Solr
 */
function SrcViewModel(data) {
    "use strict";
    var self = this;

    self.name = ko.observable();
    self.address = ko.observable();
    self.city = ko.observable();
    self.state = ko.observable();
    self.zip = ko.observable();
    self.telephone = ko.observable();
    self.fax = ko.observable();
    self.email = ko.observable();
    self.website = ko.observable();
    self.id = ko.observable();
    self.colId = undefined;
    self.ariaLab = undefined;

    this.cache = function() {};

    this.update(data);
}

/**
 * Process a Solr multivalued field (array) into a display string.
 * Returns an em dash for undefined/missing fields.
 */
SrcViewModel.prototype.refP = function (field) {
    if (field === undefined || field === null) {
        return null;
    }
    if (Array.isArray(field)) {
        return htmlDecode(field.join(", "));
    }
    return htmlDecode(String(field));
};

ko.utils.extend(SrcViewModel.prototype, {
    update: function (data) {
        this.name(this.refP(data.name));
        this.address(this.refP(data.address));
        this.city(this.refP(data.city));
        this.state(this.refP(data.state));
        this.zip(this.refP(data.zip));
        this.telephone(this.refP(data.telephone));
        this.fax(this.refP(data.fax));
        this.email(this.refP(data.email));
        this.website(this.refP(data.website));
        this.id(data.id);
        this.colId = data.colId || "collapse" + Math.random().toString(36).substring(2, 8);
        this.ariaLab = data.ariaLab || "reshead" + Math.random().toString(36).substring(2, 8);

        this.cache.latestData = data;
    },
    revert: function () {
        this.update(this.cache.latestData);
    },
    commit: function () {
        this.cache.latestData = ko.toJS(this);
    },
    blank: function () {
        this.name(null);
        this.address(null);
        this.city(null);
        this.state(null);
        this.zip(null);
        this.telephone(null);
        this.fax(null);
        this.email(null);
        this.website(null);
        this.id(null);
    }
});
