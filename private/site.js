function SiteViewModel() {
    "use strict";

    var self = this;

    self.sectionList = [
        { key: 'backstory', label: 'Backstory' },
        { key: 'search_help', label: 'Search Help' },
        { key: 'rest_help', label: 'REST API Help' }
    ];

    self.sections = {};
    self.sectionList.forEach(function (item) {
        var data = siteContentData[item.key] || {};
        self.sections[item.key] = {
            section_key: item.key,
            title: ko.observable(data.title || ''),
            content: ko.observable(data.content || ''),
            updated_at: ko.observable(data.updated_at || null),
            updated_by: ko.observable(data.updated_by || ''),
            updated_at_display: ko.computed(function () {
                // This will be re-created after initial setup
                return '';
            })
        };
    });

    // Fix up computed for display
    self.sectionList.forEach(function (item) {
        var section = self.sections[item.key];
        section.updated_at_display = ko.computed(function () {
            var val = section.updated_at();
            return val ? new Date(val).toLocaleString() : '';
        });
    });

    self.selectedKey = ko.observable(self.sectionList[0].key);
    self.showPreview = ko.observable(false);

    self.currentSection = ko.computed(function () {
        return self.sections[self.selectedKey()] || null;
    });

    self.selectSection = function (key) {
        self.selectedKey(key);
        self.showPreview(false);
    };

    self.togglePreview = function () {
        self.showPreview(!self.showPreview());
    };

    self.save = function () {
        var section = self.currentSection();
        if (!section) return;

        $.ajax({
            url: "https://" + window.location.host + "/site/" + section.section_key,
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                title: section.title(),
                content: section.content()
            }),
            success: function (data) {
                window.location.href = data.redirect || '/site';
            },
            error: function (jqXHR) {
                console.log("Save error: " + jqXHR.status);
            }
        });
    };
}

ko.applyBindings(new SiteViewModel());
