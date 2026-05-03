function CampaignsGridViewModel(initialList) {
    "use strict";
    var self = this;

    self.campaigns = ko.observableArray([]);

    (initialList || []).forEach(function (raw) {
        self.campaigns.push(new CampaignViewModel(raw));
    });

    // Keep the list sorted by name so the page is stable across reloads.
    self.campaigns.sort(function (a, b) {
        return (a.name() || '').localeCompare(b.name() || '');
    });
}
