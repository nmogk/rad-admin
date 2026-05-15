function IssueTodoViewModel(data) {
    "use strict";
    var self = this;

    self.id = ko.observable();
    self.periodical_id = ko.observable();
    self.volume = ko.observable();
    self.number = ko.observable();
    self.dt = ko.observable();
    self.link = ko.observable();
    self.editor = ko.observable(null);
    self.completed = ko.observable(false);
    self.updated_at = ko.observable();
    self.colId = undefined;
    self.ariaLab = undefined;

    self.volNoLabel = ko.pureComputed(function () {
        var v = self.volume();
        var n = self.number();
        if (v && n) { return 'Vol. ' + v + '(' + n + ')'; }
        if (v) { return 'Vol. ' + v; }
        if (n) { return 'No. ' + n; }
        return '';
    });

    self.editorLabel = ko.pureComputed(function () {
        var e = self.editor();
        return e && e.name ? e.name : 'Unassigned';
    });

    // Stable sort key: pad numeric portions of vol/no so "10" sorts after "9".
    self.sortKey = ko.pureComputed(function () {
        function pad(s) { return s ? String(s).replace(/(\d+)/g, function (m) { return ('00000000' + m).slice(-8); }) : ''; }
        return pad(self.volume()) + '|' + pad(self.number());
    });

    self.year = ko.pureComputed(function () {
        var d = self.dt();
        if (!d) return '';
        var m = String(d).match(/^(\d{4})/);
        return m ? m[1] : '';
    });

    this.cache = function () {};
    this.update(data || {});
}

ko.utils.extend(IssueTodoViewModel.prototype, {
    update: function (data) {
        this.id(data.id);
        this.periodical_id(data.periodical_id);
        this.volume(data.volume || '');
        this.number(data.number || '');
        this.dt(data.dt || '');
        this.link(data.link || '');
        this.editor(data.editor || null);
        this.completed(!!data.completed);
        this.updated_at(data.updated_at);
        this.colId = data.colId || 'issue-collapse-' + Math.random().toString(36).substring(2, 8);
        this.ariaLab = data.ariaLab || 'issue-head-' + Math.random().toString(36).substring(2, 8);
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
        this.periodical_id(null);
        this.volume('');
        this.number('');
        this.dt('');
        this.link('');
        this.editor(null);
        this.completed(false);
    }
});
