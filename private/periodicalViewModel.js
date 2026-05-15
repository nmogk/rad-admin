function PeriodicalViewModel(data) {
    "use strict";
    var self = this;

    self.id = ko.observable();
    self.name = ko.observable();
    self.publisher_name = ko.observable();
    self.updated_at = ko.observable();
    self.issues = ko.observableArray([]);
    self.showCompleted = ko.observable(false);
    self.colId = undefined;
    self.ariaLab = undefined;

    // Suggestion state for the publisher autocomplete in the periodical form.
    self.publisherSuggestions = ko.observableArray([]);
    self._publisherTimer = null;

    self.publisher_name.subscribe(function (v) {
        if (!v || v.length < 2) { self.publisherSuggestions([]); return; }
        if (self._publisherTimer) { clearTimeout(self._publisherTimer); }
        self._publisherTimer = setTimeout(function () {
            $.ajax({
                url: '/solr/source/select?',
                dataType: 'json',
                data: $.param({ q: 'name:' + v + '*', rows: 8, fl: 'name' }),
                success: function (data) {
                    var names = [];
                    data.response.docs.forEach(function (doc) {
                        var n = doc.name;
                        if (Array.isArray(n)) { n = n[0]; }
                        if (n) { names.push(n); }
                    });
                    self.publisherSuggestions(names);
                },
                error: function () { self.publisherSuggestions([]); }
            });
        }, 300);
    });

    self.selectPublisher = function (name) {
        self.publisher_name(name);
        if (self._publisherTimer) { clearTimeout(self._publisherTimer); self._publisherTimer = null; }
        self.publisherSuggestions([]);
    };

    // Issues sorted by ascending vol/no.
    self.sortedIssues = ko.pureComputed(function () {
        return self.issues().slice().sort(function (a, b) {
            return (a.sortKey() || '').localeCompare(b.sortKey() || '');
        });
    });

    self.visibleIssues = ko.pureComputed(function () {
        if (self.showCompleted()) { return self.sortedIssues(); }
        return self.sortedIssues().filter(function (i) { return !i.completed(); });
    });

    self.outstandingCount = ko.pureComputed(function () {
        return self.issues().filter(function (i) { return !i.completed(); }).length;
    });

    self.hasOutstanding = ko.pureComputed(function () {
        return self.outstandingCount() > 0;
    });

    // Header summary: "Vol. 1(1) 1990 – Vol. 30(4) 2025 · 120 issues · 8 outstanding"
    self.summary = ko.pureComputed(function () {
        var sorted = self.sortedIssues();
        var completed = sorted.filter(function (i) { return i.completed(); });
        var total = sorted.length;
        var out = self.outstandingCount();
        if (total === 0) { return 'No issues yet.'; }
        var first = completed[0];
        var last = completed[completed.length - 1];
        var range = '';
        if (first && last && first !== last) {
            range = first.volNoLabel() + (first.year() ? ' (' + first.year() + ')' : '') +
                ' – ' + last.volNoLabel() + (last.year() ? ' (' + last.year() + ')' : '');
        } else if (first) {
            range = first.volNoLabel() + (first.year() ? ' (' + first.year() + ')' : '');
        }
        var parts = [];
        if (range) { parts.push(range); }
        parts.push(total + ' issue' + (total === 1 ? '' : 's'));
        parts.push(out + ' outstanding');
        return parts.join(' · ');
    });

    self.effectiveUpdatedAt = ko.pureComputed(function () {
        var t = self.updated_at();
        self.issues().forEach(function (i) {
            var iu = i.updated_at();
            if (iu && (!t || new Date(iu) > new Date(t))) { t = iu; }
        });
        return t;
    });

    this.cache = function () {};
    this.update(data || {});
}

ko.utils.extend(PeriodicalViewModel.prototype, {
    update: function (data) {
        this.id(data.id);
        this.name(data.name);
        this.publisher_name(data.publisher_name);
        this.updated_at(data.updated_at);
        var issues = (data.issues || []).map(function (raw) {
            return raw instanceof IssueTodoViewModel ? raw : new IssueTodoViewModel(raw);
        });
        this.issues(issues);
        this.colId = data.colId || 'periodical-collapse-' + Math.random().toString(36).substring(2, 8);
        this.ariaLab = data.ariaLab || 'periodical-head-' + Math.random().toString(36).substring(2, 8);
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
        this.name('');
        this.publisher_name('');
        this.issues([]);
    }
});
