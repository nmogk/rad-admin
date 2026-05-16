function TasksGridViewModel(initialPeriodicals, initialGenerals) {
    "use strict";
    var self = this;

    self.periodicals = ko.observableArray([]);
    self.generals = ko.observableArray([]);

    // Active context for modals (set by openers, read by submit handlers).
    self.activePeriodicalId = ko.observable(null);
    self.activePeriodicalName = ko.observable('');
    self.editingPeriodical = ko.observable(null);
    self.editingIssue = ko.observable(null);
    self.editingGeneral = ko.observable(null);

    // Assign-modal state.
    self.assignableEditors = ko.observableArray([]);
    self.assignSelectedId = ko.observable(null);
    self.assignError = ko.observable('');
    self.assignTarget = null;   // { kind: 'issue'|'general', vm: ... }

    (initialPeriodicals || []).forEach(function (raw) {
        self.periodicals.push(new PeriodicalViewModel(raw));
    });
    (initialGenerals || []).forEach(function (raw) {
        self.generals.push(new GeneralTodoViewModel(raw));
    });

    // Mirrors the server-side comparator in routes/tasks.js GET / so that
    // claim/release/assign/complete actions re-order the list locally to
    // match what a refresh would produce. (#148)
    self.resortPeriodicals = function () {
        var arr = self.periodicals().slice();
        arr.sort(function (a, b) {
            var aMine = a.hasUserOutstanding() ? 1 : 0;
            var bMine = b.hasUserOutstanding() ? 1 : 0;
            if (aMine !== bMine) return bMine - aMine;
            var aOut = a.hasOutstanding() ? 1 : 0;
            var bOut = b.hasOutstanding() ? 1 : 0;
            if (aOut !== bOut) return bOut - aOut;
            var aT = a.effectiveUpdatedAt();
            var bT = b.effectiveUpdatedAt();
            if (!aT && !bT) return 0;
            if (!aT) return 1;
            if (!bT) return -1;
            return new Date(bT) - new Date(aT);
        });
        self.periodicals(arr);
    };

    self.resortGenerals = function () {
        var arr = self.generals().slice();
        arr.sort(function (a, b) {
            var aMine = (!a.completed() && a.isMine()) ? 1 : 0;
            var bMine = (!b.completed() && b.isMine()) ? 1 : 0;
            if (aMine !== bMine) return bMine - aMine;
            var aDone = a.completed() ? 1 : 0;
            var bDone = b.completed() ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            var aT = a.updated_at();
            var bT = b.updated_at();
            if (!aT && !bT) return 0;
            if (!aT) return 1;
            if (!bT) return -1;
            return new Date(bT) - new Date(aT);
        });
        self.generals(arr);
    };

    self.findPeriodical = function (id) {
        return self.periodicals().find(function (p) { return p.id() === id; });
    };
}
