/**
 * Provides functionality for deleting a reference on the server
 */
RefViewModel.prototype.deleteRef = function () {
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/refs/" + this.id(),
        type: "DELETE",
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
    ko.cleanNode($("#editRefModal")[0]) // Must clear bindings in newer version of KO
    ko.applyBindings(this, $("#editRefModal")[0]);
    $("#editRefModal").modal({ backdrop: 'static' });
}

RefViewModel.prototype.submitEdits = function () {
    this.commit();
    $("#editRefModal").modal("hide");
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/refs/" + this.id(),
        contentType: "application/json",
        data: JSON.stringify(this.cache.latestData),
        type: "POST",
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
            alert("Error sending edit request");
        }
    });
}

RefViewModel.prototype.newRefHandler = function () {
    this.commit();
    if ($("#holdInputCheck")[0].is(":checked")) {
        this.holdOver(); // Save some fields for the holdover
    } else {
        this.blank(); // Clear all fields for a blank submit
    }

    localStorage['refsEditor'] = ko.toJS(this);
    return true;
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

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
