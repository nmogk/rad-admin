// Shared form-message observables (mirrors private/sources.js pattern).
var formError = ko.observable('');
var formSuccess = ko.observable('');

CampaignViewModel.prototype.editCampaign = function () {
    formError('');
    ko.cleanNode($("#editCampaignModal")[0]);
    ko.applyBindings(this, $("#editCampaignModal")[0]);
    $("#editCampaignModal").modal({ backdrop: 'static' });
};

CampaignViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    self.commit();
    $.ajax({
        url: "/campaigns/" + self.id(),
        contentType: "application/json",
        data: JSON.stringify({ name: self.name(), description: self.description() }),
        type: "POST",
        success: function (data) {
            $("#editCampaignModal").modal("hide");
            window.location.href = data.redirect || '/campaigns';
        },
        error: function (jqXHR) {
            var msg = 'Error saving campaign';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
};

CampaignViewModel.prototype.newCampaignHandler = function () {
    var self = this;
    formError('');
    formSuccess('');
    self.commit();
    $.ajax({
        url: "/campaigns/new",
        contentType: "application/json",
        data: JSON.stringify({ name: self.name(), description: self.description() }),
        type: "POST",
        success: function (data) {
            self.blank();
            $("#newCampaignModal").modal("hide");
            window.location.href = data.redirect || '/campaigns';
        },
        error: function (jqXHR) {
            var msg = 'Error creating campaign';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
            formError(msg);
        }
    });
    return false;
};

CampaignViewModel.prototype.deleteCampaign = function () {
    var self = this;
    var refCount = self.refCount();
    var firstPrompt = refCount > 0
        ? 'Delete campaign "' + self.name() + '"? It still has ' + refCount + ' reference' + (refCount === 1 ? '' : 's') + ' attached.'
        : 'Delete campaign "' + self.name() + '"?';
    if (!window.confirm(firstPrompt)) { return; }

    function send(force) {
        $.ajax({
            url: "/campaigns/" + self.id() + (force ? '?force=1' : ''),
            type: "DELETE",
            success: function (data) {
                window.location.href = data.redirect || '/campaigns';
            },
            error: function (jqXHR) {
                if (jqXHR.status === 409 && jqXHR.responseJSON && jqXHR.responseJSON.refCount !== undefined) {
                    if (window.confirm('Server reports ' + jqXHR.responseJSON.refCount + ' refs still attached. Delete anyway?')) {
                        send(true);
                    }
                    return;
                }
                var msg = 'Error deleting campaign';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                alert(msg);
            }
        });
    }

    send(false);
};

// Build a /refs?q=id:(...) URL from the campaign's refs and navigate. The cap
// matches the orphan-refs power query in private/refs.js — Solr URL length
// limits force batching for big lists.
CampaignViewModel.prototype.openInRefs = function () {
    var ids = (this.refs() || []).slice();
    if (!ids.length) {
        alert('This campaign has no references yet.');
        return;
    }
    var CAP = 100;
    if (ids.length > CAP) {
        try {
            sessionStorage.setItem('campaignBatchNotice', JSON.stringify({
                total: ids.length, shown: CAP, campaignName: this.name()
            }));
        } catch (e) { /* sessionStorage may be unavailable */ }
        ids = ids.slice(0, CAP);
    }
    var q = 'id:(' + ids.join(' OR ') + ')';
    window.location.href = '/refs?rows=' + Math.max(ids.length, 30) +
        '&q=' + encodeURIComponent(q) +
        '&campaign=' + this.id();
};

function searchInit() {
    "use strict";
    var raw = [];
    var dataEl = document.getElementById('campaignsData');
    if (dataEl) {
        try { raw = JSON.parse(dataEl.textContent) || []; } catch (e) { raw = []; }
    }

    var grid = new CampaignsGridViewModel(raw);
    ko.applyBindings(grid, document.getElementById('mainDisplay'));

    var blank = new CampaignViewModel({});
    ko.applyBindings(blank, $("#newCampaignModal")[0]);
}

$(document).ready(searchInit());
