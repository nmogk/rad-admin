// Page init + handlers for the Tasks admin page (issue #145).

var formError = ko.observable('');
var formSuccess = ko.observable('');

var editPeriodicalModalSnapshot = null;
var editIssueModalSnapshot = null;
var editGeneralModalSnapshot = null;
var newIssueModalSnapshot = null;
var assignModalSnapshot = null;

// ---------- Periodical handlers ----------

PeriodicalViewModel.prototype.newPeriodicalHandler = function () {
    var self = this;
    formError(''); formSuccess('');
    $.ajax({
        url: '/tasks/periodicals/new',
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({ name: self.name(), publisher_name: self.publisher_name() }),
        success: function (data) {
            self.commit();
            self.blank();
            bsModalHide('#newPeriodicalModal');
            window.location.href = data.redirect || '/tasks';
        },
        error: function (jqXHR) {
            var msg = 'Error creating periodical';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

PeriodicalViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    $.ajax({
        url: '/tasks/periodicals/' + self.id(),
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({ name: self.name(), publisher_name: self.publisher_name() }),
        success: function (data) {
            self.commit();
            bsModalHide('#editPeriodicalModal');
            window.location.href = data.redirect || '/tasks';
        },
        error: function (jqXHR) {
            var msg = 'Error saving periodical';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

// ---------- Issue handlers ----------

IssueTodoViewModel.prototype.newIssueHandler = function () {
    var self = this;
    formError(''); formSuccess('');
    var periodicalId = self.periodical_id();
    $.ajax({
        url: '/tasks/periodicals/' + periodicalId + '/issues/new',
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({
            volume: self.volume(),
            number: self.number(),
            dt: self.dt(),
            link: self.link()
        }),
        success: function () {
            bsModalHide('#newIssueModal');
            window.location.href = '/tasks';
        },
        error: function (jqXHR) {
            var msg = 'Error creating issue';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

IssueTodoViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    $.ajax({
        url: '/tasks/issues/' + self.id(),
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({
            volume: self.volume(),
            number: self.number(),
            dt: self.dt(),
            link: self.link()
        }),
        success: function (data) {
            if (data.issue) { self.update(data.issue); }
            self.commit();
            bsModalHide('#editIssueModal');
        },
        error: function (jqXHR) {
            var msg = 'Error saving issue';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

// ---------- General handlers ----------

GeneralTodoViewModel.prototype.newGeneralHandler = function () {
    var self = this;
    formError(''); formSuccess('');
    $.ajax({
        url: '/tasks/general/new',
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({
            description: self.description(),
            dt: self.dt(),
            link: self.link()
        }),
        success: function (data) {
            self.commit();
            self.blank();
            bsModalHide('#newGeneralTodoModal');
            window.location.href = data.redirect || '/tasks';
        },
        error: function (jqXHR) {
            var msg = 'Error creating task';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

GeneralTodoViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    $.ajax({
        url: '/tasks/general/' + self.id(),
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({
            description: self.description(),
            dt: self.dt(),
            link: self.link()
        }),
        success: function (data) {
            if (data.todo) { self.update(data.todo); }
            self.commit();
            bsModalHide('#editGeneralTodoModal');
        },
        error: function (jqXHR) {
            var msg = 'Error saving task';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

// ---------- Grid-level action methods (attached after grid is created) ----------

function attachGridActions(grid) {

    grid.openAddIssue = function (periodical) {
        grid.activePeriodicalId(periodical.id());
        grid.activePeriodicalName(periodical.name());
        var modal = $('#newIssueModal')[0];
        if (newIssueModalSnapshot === null) {
            newIssueModalSnapshot = modal.innerHTML;
        } else {
            ko.cleanNode(modal);
            modal.innerHTML = newIssueModalSnapshot;
        }
        var blank = new IssueTodoViewModel({ periodical_id: periodical.id() });
        ko.applyBindings(blank, modal);
        initBootstrapWidgets('#newIssueModal');
        bsModalShow('#newIssueModal', { backdrop: 'static' });
    };

    grid.openPublisher = function (periodical) {
        var name = periodical.publisher_name();
        if (!name) { alert('No publisher set on this periodical.'); return; }
        var encoded = encodeURIComponent('"' + name + '"');
        window.open('/sources?rows=1&q=name:' + encoded, '_blank');
    };

    grid.editPeriodical = function (periodical) {
        formError('');
        var modal = $('#editPeriodicalModal')[0];
        if (editPeriodicalModalSnapshot === null) {
            editPeriodicalModalSnapshot = modal.innerHTML;
        } else {
            ko.cleanNode(modal);
            modal.innerHTML = editPeriodicalModalSnapshot;
        }
        ko.applyBindings(periodical, modal);
        initBootstrapWidgets('#editPeriodicalModal');
        bsModalShow('#editPeriodicalModal', { backdrop: 'static' });
    };

    grid.deletePeriodical = function (periodical) {
        var issueCount = (periodical.issues() || []).length;
        var body = issueCount > 0
            ? 'Delete periodical "' + periodical.name() + '"? It still has ' + issueCount + ' issue' + (issueCount === 1 ? '' : 's') + ' attached.'
            : 'Delete periodical "' + periodical.name() + '"?';
        confirmDialog({
            title: 'Delete periodical',
            body: body,
            confirmText: 'Delete',
            confirmClass: 'btn-danger'
        }, function () {
            $.ajax({
                url: '/tasks/periodicals/' + periodical.id() + (issueCount > 0 ? '?force=1' : ''),
                type: 'DELETE',
                success: function (data) { window.location.href = data.redirect || '/tasks'; },
                error: function (jqXHR) {
                    var msg = 'Error deleting periodical';
                    if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                    alert(msg);
                }
            });
        });
    };

    grid.toggleIssueComplete = function (issue) {
        // Knockout's `checked` binding flips the value before the click handler
        // runs, so we send the post-flip state. Returning true preserves the
        // checkbox toggle in the DOM.
        var newState = !issue.completed();
        $.ajax({
            url: '/tasks/issues/' + issue.id() + '/complete',
            contentType: 'application/json',
            type: 'POST',
            data: JSON.stringify({ completed: newState }),
            error: function () {
                issue.completed(!newState); // revert UI on failure
                alert('Could not update completion state.');
            }
        });
        return true;
    };

    grid.enterReferences = function (issue) {
        var periodical = grid.findPeriodical(issue.periodical_id());
        if (!periodical) { alert('Periodical not found.'); return; }
        var prefill = {
            publisher: periodical.publisher_name(),
            source: periodical.publisher_name(),
            reference: periodical.name() + ' ' + issue.volNoLabel(),
            dt: issue.dt()
        };
        try {
            sessionStorage.setItem('refsPrefill', JSON.stringify(prefill));
        } catch (e) { /* sessionStorage may be unavailable */ }
        window.location.href = '/refs';
    };

    grid.claimIssue = function (issue) {
        $.ajax({
            url: '/tasks/issues/' + issue.id() + '/claim',
            type: 'POST',
            success: function (data) { issue.editor(data.editor); grid.resortPeriodicals(); },
            error: function () { alert('Could not claim issue.'); }
        });
    };

    grid.releaseIssue = function (issue) {
        $.ajax({
            url: '/tasks/issues/' + issue.id() + '/release',
            type: 'POST',
            success: function () { issue.editor(null); grid.resortPeriodicals(); },
            error: function (jqXHR) {
                var msg = 'Could not release issue.';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                alert(msg);
            }
        });
    };

    grid.assignIssue = function (issue) { openAssign('issue', issue); };
    grid.assignGeneral = function (general) { openAssign('general', general); };

    function openAssign(kind, vm) {
        grid.assignError('');
        grid.assignSelectedId(null);
        grid.assignTarget = { kind: kind, vm: vm };
        $.ajax({
            url: '/tasks/users.json',
            dataType: 'json',
            success: function (users) {
                grid.assignableEditors(users);
                var modal = $('#assignEditorModal')[0];
                if (assignModalSnapshot === null) {
                    assignModalSnapshot = modal.innerHTML;
                } else {
                    ko.cleanNode(modal);
                    modal.innerHTML = assignModalSnapshot;
                }
                ko.applyBindings(grid, modal);
                initBootstrapWidgets('#assignEditorModal');
                bsModalShow('#assignEditorModal', { backdrop: 'static' });
            },
            error: function () { alert('Could not load editor list.'); }
        });
    }

    grid.submitAssign = function () {
        var t = grid.assignTarget;
        var editorId = grid.assignSelectedId();
        if (!t || !editorId) { grid.assignError('Pick an editor.'); return false; }
        var url = '/tasks/' + (t.kind === 'issue' ? 'issues' : 'general') + '/' + t.vm.id() + '/assign';
        $.ajax({
            url: url,
            contentType: 'application/json',
            type: 'POST',
            data: JSON.stringify({ editor_id: editorId }),
            success: function (data) {
                t.vm.editor(data.editor);
                bsModalHide('#assignEditorModal');
                grid.resortPeriodicals();
            },
            error: function (jqXHR) {
                var msg = 'Could not assign editor.';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                grid.assignError(msg);
            }
        });
        return false;
    };

    grid.editIssue = function (issue) {
        formError('');
        var modal = $('#editIssueModal')[0];
        if (editIssueModalSnapshot === null) {
            editIssueModalSnapshot = modal.innerHTML;
        } else {
            ko.cleanNode(modal);
            modal.innerHTML = editIssueModalSnapshot;
        }
        ko.applyBindings(issue, modal);
        initBootstrapWidgets('#editIssueModal');
        bsModalShow('#editIssueModal', { backdrop: 'static' });
    };

    grid.deleteIssue = function (issue) {
        confirmDialog({
            title: 'Delete issue',
            body: 'Delete issue "' + issue.volNoLabel() + '"?',
            confirmText: 'Delete',
            confirmClass: 'btn-danger'
        }, function () {
            $.ajax({
                url: '/tasks/issues/' + issue.id(),
                type: 'DELETE',
                success: function () {
                    var periodical = grid.findPeriodical(issue.periodical_id());
                    if (periodical) { periodical.issues.remove(issue); }
                    grid.resortPeriodicals();
                },
                error: function (jqXHR) {
                    var msg = 'Error deleting issue';
                    if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                    alert(msg);
                }
            });
        });
    };

    grid.toggleGeneralComplete = function (general) {
        var newState = !general.completed();
        $.ajax({
            url: '/tasks/general/' + general.id() + '/complete',
            contentType: 'application/json',
            type: 'POST',
            data: JSON.stringify({ completed: newState }),
            error: function () {
                general.completed(!newState);
                alert('Could not update completion state.');
            }
        });
        return true;
    };

    grid.claimGeneral = function (general) {
        $.ajax({
            url: '/tasks/general/' + general.id() + '/claim',
            type: 'POST',
            success: function (data) { general.editor(data.editor); },
            error: function () { alert('Could not claim task.'); }
        });
    };

    grid.releaseGeneral = function (general) {
        $.ajax({
            url: '/tasks/general/' + general.id() + '/release',
            type: 'POST',
            success: function () { general.editor(null); },
            error: function (jqXHR) {
                var msg = 'Could not release task.';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                alert(msg);
            }
        });
    };

    grid.editGeneral = function (general) {
        formError('');
        var modal = $('#editGeneralTodoModal')[0];
        if (editGeneralModalSnapshot === null) {
            editGeneralModalSnapshot = modal.innerHTML;
        } else {
            ko.cleanNode(modal);
            modal.innerHTML = editGeneralModalSnapshot;
        }
        ko.applyBindings(general, modal);
        initBootstrapWidgets('#editGeneralTodoModal');
        bsModalShow('#editGeneralTodoModal', { backdrop: 'static' });
    };

    grid.deleteGeneral = function (general) {
        confirmDialog({
            title: 'Delete task',
            body: 'Delete this task?',
            confirmText: 'Delete',
            confirmClass: 'btn-danger'
        }, function () {
            $.ajax({
                url: '/tasks/general/' + general.id(),
                type: 'DELETE',
                success: function () { grid.generals.remove(general); },
                error: function (jqXHR) {
                    var msg = 'Error deleting task';
                    if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                    alert(msg);
                }
            });
        });
    };
}

function tasksInit() {
    "use strict";
    var rawP = [], rawG = [];
    var pEl = document.getElementById('periodicalsData');
    if (pEl) { try { rawP = JSON.parse(pEl.textContent) || []; } catch (e) { rawP = []; } }
    var gEl = document.getElementById('generalsData');
    if (gEl) { try { rawG = JSON.parse(gEl.textContent) || []; } catch (e) { rawG = []; } }

    var grid = new TasksGridViewModel(rawP, rawG);
    attachGridActions(grid);
    ko.applyBindings(grid, document.getElementById('mainDisplay'));
    initBootstrapWidgets();

    var blankPeriodical = new PeriodicalViewModel({});
    ko.applyBindings(blankPeriodical, $('#newPeriodicalModal')[0]);
    initBootstrapWidgets('#newPeriodicalModal');

    var blankGeneral = new GeneralTodoViewModel({});
    ko.applyBindings(blankGeneral, $('#newGeneralTodoModal')[0]);
    initBootstrapWidgets('#newGeneralTodoModal');
}

$(document).on('click', '.info-icon', function (e) { e.preventDefault(); });
$(function () { initBootstrapWidgets(); });
$(document).ready(tasksInit());
