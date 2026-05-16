function GeneralTodoViewModel(data) {
    "use strict";
    var self = this;

    self.id = ko.observable();
    self.description = ko.observable();
    self.dt = ko.observable();
    self.link = ko.observable();
    self.editor = ko.observable(null);
    self.completed = ko.observable(false);
    self.updated_at = ko.observable();
    self.colId = undefined;
    self.ariaLab = undefined;

    self.descriptionPreview = ko.pureComputed(function () {
        var d = self.description();
        if (!d) return '';
        var firstLine = String(d).split(/\r?\n/)[0];
        return firstLine.length > 120 ? firstLine.substring(0, 117) + '…' : firstLine;
    });

    self.editorLabel = ko.pureComputed(function () {
        var e = self.editor();
        return e && e.name ? e.name : 'Unassigned';
    });

    self.isMine = ko.pureComputed(function () {
        var uid = window.currentUserId;
        if (!uid) { return false; }
        var e = self.editor();
        return !!(e && e.id === uid);
    });

    this.cache = function () {};
    this.update(data || {});
}

ko.utils.extend(GeneralTodoViewModel.prototype, {
    update: function (data) {
        this.id(data.id);
        this.description(data.description || '');
        this.dt(data.dt || '');
        this.link(data.link || '');
        this.editor(data.editor || null);
        this.completed(!!data.completed);
        this.updated_at(data.updated_at);
        this.colId = data.colId || 'general-collapse-' + Math.random().toString(36).substring(2, 8);
        this.ariaLab = data.ariaLab || 'general-head-' + Math.random().toString(36).substring(2, 8);
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
        this.description('');
        this.dt('');
        this.link('');
        this.editor(null);
        this.completed(false);
    }
});
