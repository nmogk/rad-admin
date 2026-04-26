/**
 * Provides functionality for deleting a source on the server
 */
SrcViewModel.prototype.deleteSource = function () {
    $.ajax({
        url: "/sources/" + this.id(),
        type: "DELETE",
        success: function (data) {
            window.location.href = data.redirect || '/sources';
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
            alert("Error sending delete request");
        }
    });
}

/**
 * Provides functionality for populating the edit dialog with the correct
 * source item.
 */
SrcViewModel.prototype.editSource = function () {
    formError('');
    ko.cleanNode($("#editSourceModal")[0]);
    ko.applyBindings(this, $("#editSourceModal")[0]);
    $("#editSourceModal").modal({ backdrop: 'static' });
}

SrcViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    self.commit();
    $.ajax({
        url: "/sources/" + self.id(),
        contentType: "application/json",
        data: JSON.stringify(self.cache.latestData),
        type: "POST",
        success: function (data) {
            $("#editSourceModal").modal("hide");
            window.location.href = data.redirect || '/sources';
        },
        error: function (jqXHR) {
            var msg = 'Error sending edit request';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                msg = jqXHR.responseJSON.error;
            }
            formError(msg);
        }
    });
}

SrcViewModel.prototype.newSourceHandler = function () {
    var self = this;
    formError('');
    formSuccess('');
    self.commit();
    $.ajax({
        url: "/sources/new",
        contentType: "application/json",
        data: JSON.stringify(self.cache.latestData),
        type: "POST",
        success: function (data) {
            self.blank();
            localStorage['sourcesEditor'] = ko.toJSON(self);
            $("#newSourceModal").modal("hide");
            window.location.href = data.redirect || '/sources';
        },
        error: function (jqXHR) {
            var msg = 'Error creating source';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                msg = jqXHR.responseJSON.error;
            }
            formError(msg);
        }
    });
    return false;
}

/**
 * Performs initialization functions after page loads.
 */
function searchInit() {
    "use strict";
    var queryString = parseQuery();

    var blankSrcViewModel = new SrcViewModel({});
    if (localStorage['sourcesEditor']) {
        blankSrcViewModel.update(JSON.parse(localStorage['sourcesEditor']));
    }
    ko.applyBindings(blankSrcViewModel, $("#newSourceModal")[0]);

    if (queryString.q !== undefined) {
        queryString.q = queryString["q"].replace(/%3A/g, ":");
        document.getElementById("mainDisplay").setAttribute("aria-hidden", "false");
        document.getElementById("searchInput").value = decodeURIComponent(queryString.q.replace(/[+]/g, "%20"));
        document.getElementById("rowsInput").value = queryString.rows;
        ko.applyBindings(new SrcGridViewModel(queryString), $("#mainDisplay")[0]);
    }
}

// Shared observables for form validation errors and success messages
var formError = ko.observable('');
var formSuccess = ko.observable('');

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
