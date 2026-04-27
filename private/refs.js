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
 * Opens the sources page filtered to this reference's source for editing.
 */
RefViewModel.prototype.viewSourceForEditing = function () {
    var sourceName = this.source();
    if (!sourceName) {
        alert("This reference does not have a source.");
        return;
    }
    var encodedName = encodeURIComponent('"' + sourceName + '"');
    window.open('/sources?rows=1&q=name:' + encodedName, '_blank');
};

/**
 * Provides functionality for populating the edit dialog with the correct
 * ref item.
 */
RefViewModel.prototype.editRef = function () {
    formError('');
    sourceSuggestions([]);
    sourceNotFound(false);
    ko.cleanNode($("#editRefModal")[0]) // Must clear bindings in newer version of KO
    this.source.subscribe(lookupSources);
    ko.applyBindings(this, $("#editRefModal")[0]);
    $("#editRefModal").modal({ backdrop: 'static' });
}

RefViewModel.prototype.submitEdits = function () {
    var self = this;
    formError('');
    sourceSuggestions([]);
    sourceNotFound(false);
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
    sourceSuggestions([]);
    sourceNotFound(false);
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
    sourceSuggestions([]);
    sourceNotFound(false);
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
    // Subscribe to source field changes for autocomplete
    blankRefViewModel.source.subscribe(lookupSources);
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

// Source autocomplete
var sourceSuggestions = ko.observableArray([]);
var sourceNotFound = ko.observable(false);
var _sourceTimer = null;

function lookupSources(value) {
    if (!value || value.length < 2) {
        sourceSuggestions([]);
        sourceNotFound(false);
        return;
    }
    if (_sourceTimer) { clearTimeout(_sourceTimer); }
    _sourceTimer = setTimeout(function () {
        $.ajax({
            url: "/solr/source/select?",
            dataType: "json",
            data: $.param({ q: 'name:' + value + '*', rows: 8, fl: 'name' }),
            success: function (data) {
                var names = [];
                data.response.docs.forEach(function (doc) {
                    var n = doc.name;
                    if (Array.isArray(n)) { n = n[0]; }
                    if (n) { names.push(n); }
                });
                sourceSuggestions(names);
                sourceNotFound(data.response.numFound === 0);
            },
            error: function () {
                sourceSuggestions([]);
                sourceNotFound(false);
            }
        });
    }, 300);
}

function selectSource(name) {
    // Find the active ref view model by checking which modal is visible
    var modal = $('.modal.in');
    if (modal.length) {
        var ctx = ko.dataFor(modal.find('form')[0]);
        if (ctx && ctx.source) {
            ctx.source(name);
        }
    }
    // Cancel any pending lookup triggered by the source change above
    if (_sourceTimer) { clearTimeout(_sourceTimer); _sourceTimer = null; }
    sourceSuggestions([]);
    sourceNotFound(false);
}

// Dismiss source suggestions when clicking outside the source field area
$(document).on('mousedown', function (e) {
    if (sourceSuggestions().length === 0 && !sourceNotFound()) { return; }
    var $target = $(e.target);
    if (!$target.closest('#sourceField, .list-group').length) {
        sourceSuggestions([]);
        sourceNotFound(false);
    }
});

function createSourceFromRef() {
    // Find the active ref modal's source value
    var modal = $('.modal.in');
    var sourceName = '';
    if (modal.length) {
        var ctx = ko.dataFor(modal.find('form')[0]);
        if (ctx && ctx.source) {
            sourceName = ctx.source() || '';
        }
    }
    // Hide the ref modal temporarily
    modal.modal('hide');

    // Create a blank source view model with the name pre-filled
    var blankSource = new SrcViewModel({ name: sourceName });
    ko.cleanNode($("#newSourceModal")[0]);

    // Override the new source handler to return to the ref modal after save
    var originalHandler = SrcViewModel.prototype.newSourceHandler;
    blankSource.newSourceHandler = function () {
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
                $("#newSourceModal").modal("hide");
                sourceNotFound(false);
                sourceSuggestions([]);
                // Re-show the ref modal
                modal.modal({ backdrop: 'static' });
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
    };

    ko.applyBindings(blankSource, $("#newSourceModal")[0]);
    $("#newSourceModal").modal({ backdrop: 'static' });
}

var BLANK_QUERYABLE_FIELDS = ['author', 'title', 'reference', 'source', 'page', 'abstract', 'dt'];

function buildBlankFieldQuery(field) {
    if (!field) {
        var clauses = BLANK_QUERYABLE_FIELDS.map(function (f) { return '-' + f + ':[* TO *]'; });
        return '*:* AND (' + clauses.join(' OR ') + ')';
    }
    return '*:* AND -' + field + ':[* TO *]';
}

function searchBlankField(field) {
    var input = document.getElementById('searchInput');
    input.value = buildBlankFieldQuery(field);
    input.form.submit();
}

$(document).on('click', '#blankSearchBtn', function () {
    searchBlankField('');
});

$(document).on('click', '[data-blank-field]', function (e) {
    e.preventDefault();
    searchBlankField(this.getAttribute('data-blank-field'));
});

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
