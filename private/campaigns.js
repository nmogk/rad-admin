// Shared form-message observables (mirrors private/sources.js pattern).
var formError = ko.observable('');
var formSuccess = ko.observable('');

// Snapshot of #editCampaignModal's pristine HTML. See editRefModalSnapshot
// in private/refs.js for rationale: ko.cleanNode doesn't remove DOM cloned
// by `<!-- ko if -->`/`foreach`, so repeated edits stack content.
var editCampaignModalSnapshot = null;

CampaignViewModel.prototype.editCampaign = function () {
    formError('');
    var modal = $("#editCampaignModal")[0];
    if (editCampaignModalSnapshot === null) {
        editCampaignModalSnapshot = modal.innerHTML;
    } else {
        ko.cleanNode(modal);
        modal.innerHTML = editCampaignModalSnapshot;
    }
    ko.applyBindings(this, modal);
    // ko.cleanNode invokes jQuery.cleanData, which wipes Bootstrap's popover
    // state along with KO bindings. Re-init so the info icons work again.
    initBootstrapWidgets("#editCampaignModal");
    bsModalShow("#editCampaignModal", { backdrop: 'static' });
};

CampaignViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    // Don't commit before submit â€” Cancel calls revert(), so cache must hold
    // the last KNOWN-GOOD state, not the in-flight (possibly invalid) state.
    // See refs.js submitEdits for full rationale. (#112)
    $.ajax({
        url: "/campaigns/" + self.id(),
        contentType: "application/json",
        data: JSON.stringify({ name: self.name(), description: self.description() }),
        type: "POST",
        success: function (data) {
            self.commit();
            bsModalHide("#editCampaignModal");
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
    $.ajax({
        url: "/campaigns/new",
        contentType: "application/json",
        data: JSON.stringify({ name: self.name(), description: self.description() }),
        type: "POST",
        success: function (data) {
            self.commit();
            self.blank();
            bsModalHide("#newCampaignModal");
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
    var body = refCount > 0
        ? 'Delete campaign "' + self.name() + '"? It still has ' + refCount + ' reference' + (refCount === 1 ? '' : 's') + ' attached.'
        : 'Delete campaign "' + self.name() + '"?';

    confirmDialog({
        title: 'Delete campaign',
        body: body,
        confirmText: 'Delete',
        confirmClass: 'btn-danger'
    }, function () {
        // The client already knows refCount, so send force=1 up front when
        // refs are attached. That avoids the server's 409 round-trip and the
        // second confirmation that produced.
        $.ajax({
            url: "/campaigns/" + self.id() + (refCount > 0 ? '?force=1' : ''),
            type: "DELETE",
            success: function (data) {
                window.location.href = data.redirect || '/campaigns';
            },
            error: function (jqXHR) {
                var msg = 'Error deleting campaign';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) { msg = jqXHR.responseJSON.error; }
                alert(msg);
            }
        });
    });
};

// Build a /refs?q=id:(...) URL from the campaign's refs and navigate. The cap
// matches the orphan-refs power query in private/refs.js â€” Solr URL length
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
    initBootstrapWidgets();

    var blank = new CampaignViewModel({});
    ko.applyBindings(blank, $("#newCampaignModal")[0]);
    initBootstrapWidgets("#newCampaignModal");
}

// Bootstrap popovers must be opt-in.
$(document).on('click', '.info-icon', function (e) { e.preventDefault(); });
$(function () {
    initBootstrapWidgets();
});

$(document).ready(searchInit());
