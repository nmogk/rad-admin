/**
 * Provides functionality for deleting a reference on the server
 */
RefViewModel.prototype.deleteRef = function () {
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/refs/" + this.id(),
        type: "DELETE",
        success: function (data) {
            window.location.href = data.redirect || '/refs';
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
            alert("Error sending delete request");
        }
    });
}

/**
 * Provides functionality for populating the edit dialog with the correct
 * ref item.
 */
RefViewModel.prototype.editRef = function () {
    formError('');
    ko.cleanNode($("#editRefModal")[0]) // Must clear bindings in newer version of KO
    ko.applyBindings(this, $("#editRefModal")[0]);
    $("#editRefModal").modal({ backdrop: 'static' });
}

RefViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    self.commit();
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/refs/" + self.id(),
        contentType: "application/json",
        data: JSON.stringify(self.cache.latestData),
        type: "POST",
        success: function (data) {
            $("#editRefModal").modal("hide");
            window.location.href = data.redirect || '/refs';
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

RefViewModel.prototype.newRefHandler = function () {
    var self = this;
    formError('');
    formSuccess('');
    self.commit();
    $.ajax({
        url: "/refs/new",
        contentType: "application/json",
        data: JSON.stringify(self.cache.latestData),
        type: "POST",
        success: function (data) {
            self.blank();
            localStorage['refsEditor'] = ko.toJSON(self);
            $("#newRefModal").modal("hide");
            window.location.href = data.redirect || '/refs';
        },
        error: function (jqXHR) {
            var msg = 'Error creating reference';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                msg = jqXHR.responseJSON.error;
            }
            formError(msg);
        }
    });
    return false; // Prevent traditional form submission
}

/**
 * Saves the current reference, holds over shared fields (date, reference, source),
 * and keeps the modal open for entering the next reference.
 */
RefViewModel.prototype.saveAndAddAnother = function () {
    var self = this;
    formError('');
    formSuccess('');
    self.commit();
    $.ajax({
        url: "/refs/new",
        contentType: "application/json",
        data: JSON.stringify(self.cache.latestData),
        type: "POST",
        success: function (data) {
            self.holdOver();
            localStorage['refsEditor'] = ko.toJSON(self);
            formSuccess('Reference saved. Enter the next reference below.');
        },
        error: function (jqXHR) {
            var msg = 'Error creating reference';
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                msg = jqXHR.responseJSON.error;
            }
            formError(msg);
        }
    });
}

/**
 * Performs initialization functions after page loads. Specifically, applies the reference view
 * model if a query has been submitted to the page
 */
function searchInit() {
    "use strict";
    // Create an object which contains the query string as keys/values
    var queryString = parseQuery();

    if (queryString.boost !== undefined) {
        document.getElementById("boostCheck").checked = true;
    }

    var blankRefViewModel = new RefViewModel({});
    if (localStorage['refsEditor']) {
        blankRefViewModel.update(localStorage['refsEditor']);
    }
    ko.applyBindings(blankRefViewModel, $("#newRefModal")[0]);

    if (queryString.q !== undefined) {
        queryString.q = queryString["q"].replace(/%3A/g, ":"); // Unescape : in query string
        document.getElementById("mainDisplay").setAttribute("aria-hidden", "false"); // Show main body
        document.getElementById("searchInput").value = decodeURIComponent(queryString.q.replace(/[+]/g, "%20")); // Put query back in search bar, unescape special + encoding
        document.getElementById("rowsInput").value = queryString.rows; // Put row setting back in search bar
        ko.applyBindings(new RefsGridViewModel(queryString), $("#mainDisplay")[0]);
    }
}

// Shared observables for form validation errors and success messages
var formError = ko.observable('');
var formSuccess = ko.observable('');

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
