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
    // Live computed of problematic chars currently in the form. Note: chars
    // that htmlDecode silently drops on the way from Solr to the observable
    // (NBSP, zero-width, etc.) won't appear here — the search button is the
    // canonical source for "this record contains invisibles."
    attachOddCharReport(this);
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
    attachOddCharReport(blankRefViewModel);
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
        // "At least one field missing" via De Morgan: NOT (all fields present).
        // A parenthesised OR of pure negations evaluates against nothing in Solr
        // and returns zero hits, even when ANDed with *:*.
        var clauses = BLANK_QUERYABLE_FIELDS.map(function (f) { return f + ':[* TO *]'; });
        return '*:* AND -(' + clauses.join(' AND ') + ')';
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

var ODD_CHAR_SEARCH_FIELDS = ['title', 'author', 'abstract', 'reference', 'source', 'page'];

// Lucene RegExp character-class bodies. NUL is omitted because it does not
// survive HTTP transport reliably. Tab/LF/CR are omitted from "control"
// because they appear legitimately in abstracts.
var ODD_CHAR_CLASSES = {
    control: '\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD',
    invisible: '\u00A0\u00AD\u200B\u200C\u200D\u2028\u2029\uFEFF',
    smart: '\u2018\u2019\u201C\u201D\u2013\u2014\u2026'
};

function buildOddCharQuery(category) {
    var chars = category
        ? (ODD_CHAR_CLASSES[category] || '')
        : ODD_CHAR_CLASSES.control + ODD_CHAR_CLASSES.invisible + ODD_CHAR_CLASSES.smart;
    var regex = '/.*[' + chars + '].*/';
    var clauses = ODD_CHAR_SEARCH_FIELDS.map(function (f) { return f + ':' + regex; });
    return '(' + clauses.join(' OR ') + ')';
}

function searchOddChars(category) {
    var input = document.getElementById('searchInput');
    input.value = buildOddCharQuery(category);
    input.form.submit();
}

$(document).on('click', '#oddCharSearchBtn', function () {
    searchOddChars('');
});

$(document).on('click', '[data-odd-chars]', function (e) {
    e.preventDefault();
    searchOddChars(this.getAttribute('data-odd-chars'));
});

// Builds and submits a search for refs whose `source` doesn't match any
// document in the source core. Two-step flow because Solr can't join across
// cores: pull every source name, then exclude them from a query against rad.
function searchOrphanSources() {
    var btn = document.getElementById('orphanSourceBtn');
    var originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="glyphicon glyphicon-refresh"></span>';
    $.ajax({
        url: '/solr/source/select?',
        dataType: 'json',
        data: $.param({ q: '*:*', rows: 10000, fl: 'name' }),
        success: function (data) {
            var names = [];
            data.response.docs.forEach(function (doc) {
                var n = doc.name;
                if (Array.isArray(n)) { n = n[0]; }
                if (n) { names.push(escapeSolrPhrase(n)); }
            });
            var input = document.getElementById('searchInput');
            if (!names.length) {
                input.value = 'source:[* TO *]';
            } else {
                input.value = 'source:[* TO *] AND -source:(' + names.join(' OR ') + ')';
            }
            input.form.submit();
        },
        error: function (jqXHR) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            alert('Could not load source list (status ' + jqXHR.status + ').');
        }
    });
}

$(document).on('click', '#orphanSourceBtn', function () {
    searchOrphanSources();
});

// Friendly labels for the problematic chars surfaced in the edit-modal banner.
var ODD_CHAR_LABELS = [
    [/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, 'control character'],
    [/\uFFFD/g, 'replacement character'],
    [/\u00A0/g, 'non-breaking space'],
    [/\u00AD/g, 'soft hyphen'],
    [/[\u200B\u200C\u200D]/g, 'zero-width character'],
    [/[\u2028\u2029]/g, 'line/paragraph separator'],
    [/\uFEFF/g, 'byte-order mark'],
    [/[\u2018\u2019]/g, 'smart single quote'],
    [/[\u201C\u201D]/g, 'smart double quote'],
    [/\u2013/g, 'en dash'],
    [/\u2014/g, 'em dash'],
    [/\u2026/g, 'ellipsis']
];

function summarizeOddChars(value) {
    if (typeof value !== 'string' || !value) { return []; }
    var found = [];
    ODD_CHAR_LABELS.forEach(function (pair) {
        var m = value.match(pair[0]);
        if (m) { found.push({ name: pair[1], count: m.length }); }
    });
    return found;
}

function buildOddCharReport(values) {
    var fields = [
        ['title', values.title], ['author', values.author],
        ['reference', values.reference], ['source', values.source],
        ['page', values.page], ['abstract', values.abst]
    ];
    var lines = [];
    fields.forEach(function (entry) {
        var fieldName = entry[0];
        summarizeOddChars(entry[1]).forEach(function (s) {
            var label = s.name + (s.count === 1 ? '' : 's');
            lines.push(fieldName + ' \u2014 ' + s.count + ' ' + label);
        });
    });
    return lines;
}

// Attaches a live oddCharReport computed observable to a RefViewModel
// instance. Used by both the edit modal and the new-reference modal so
// editors see what server-side sanitize will replace as they type or paste.
function attachOddCharReport(vm) {
    vm.oddCharReport = ko.pureComputed(function () {
        return buildOddCharReport({
            title: vm.title(), author: vm.author(),
            reference: vm.reference(), source: vm.source(),
            page: vm.page(), abst: vm.abst()
        });
    });
}

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
