function SiteViewModel() {
    "use strict";

    var self = this;

    self.sectionList = [
        { key: 'backstory', label: 'Backstory' },
        { key: 'search_area', label: 'Search Area Intro' },
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

    self.selectedLabel = ko.computed(function () {
        var item = self.sectionList.find(function (s) { return s.key === self.selectedKey(); });
        return item ? item.label : self.selectedKey();
    });

    self.selectSection = function (key) {
        self.selectedKey(key);
        self.showPreview(false);
    };

    self.togglePreview = function () {
        var key = self.selectedKey();
        var section = self.sections[key];
        if (!section) return;

        // Help sections contain full modal HTML — render as a modal popup
        if (key === 'search_help' || key === 'rest_help') {
            var container = $('#previewContainer');
            container.empty();
            container.html(section.content());
            var modal = container.find('.modal');
            if (modal.length) {
                modal.on('hidden.bs.modal', function () {
                    container.empty();
                });
                bsModalShow(modal);
            } else {
                // Content doesn't contain a modal — fall back to inline preview
                self.showPreview(!self.showPreview());
            }
        } else {
            self.showPreview(!self.showPreview());
        }
    };

    self.save = function () {
        // Capture the section_key from selectedKey (the same observable the
        // tab nav and "Editing X" banner read from) instead of dereferencing
        // currentSection. This guarantees the AJAX URL and the section the
        // user sees in the UI are the same — issue #159.
        var key = self.selectedKey();
        var section = self.sections[key];
        if (!section) return;

        $.ajax({
            url: "https://" + window.location.host + "/site/" + encodeURIComponent(key),
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

    self.resetFromFile = function () {
        var key = self.selectedKey();
        var section = self.sections[key];
        if (!section) return;

        confirmDialog({
            title: 'Reset from file?',
            body: 'This overwrites the "' + key + '" content in the database with the current contents of views/partials/. Any saved or unsaved DB edits to this section will be lost.',
            confirmText: 'Reset',
            confirmClass: 'btn-danger'
        }, function () {
            $.ajax({
                url: "https://" + window.location.host + "/site/" + encodeURIComponent(key) + "/reset",
                method: "POST",
                success: function (data) {
                    section.content(data.content);
                    section.updated_at(data.updated_at);
                    section.updated_by(data.updated_by);
                },
                error: function (jqXHR) {
                    // Surface the server's error so failures (stale server
                    // running an older ALLOWED_KEYS list, missing source
                    // file, permission denied, etc.) don't disappear into
                    // the console with no UI feedback.
                    var detail = (jqXHR.responseJSON && jqXHR.responseJSON.error) || ('HTTP ' + jqXHR.status);
                    alert('Reset from file failed: ' + detail);
                    console.log("Reset error: " + jqXHR.status, jqXHR.responseJSON);
                }
            });
        });
    };
}

ko.applyBindings(new SiteViewModel());
initBootstrapWidgets();
