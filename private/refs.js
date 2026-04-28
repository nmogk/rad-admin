/**
 * Provides functionality for deleting a reference on the server
 */
RefViewModel.prototype.deleteRef = function () {
    // Forward the current page's query string so the server's redirect lands
    // back on the user's active search rather than an empty /refs page.
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/refs/" + this.id() + window.location.search,
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

RefViewModel.prototype.viewPublisherForEditing = function () {
    var publisherName = this.publisher();
    if (!publisherName) {
        alert("This reference does not have a publisher.");
        return;
    }
    var encodedName = encodeURIComponent('"' + publisherName + '"');
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
    publisherSuggestions([]);
    publisherNotFound(false);
    ko.cleanNode($("#editRefModal")[0]) // Must clear bindings in newer version of KO
    this.source.subscribe(lookupSources);
    this.publisher.subscribe(lookupPublishers);
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
    publisherSuggestions([]);
    publisherNotFound(false);
    syncSourceFromPublisher(self);
    self.commit();
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/refs/" + self.id() + window.location.search,
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
    publisherSuggestions([]);
    publisherNotFound(false);
    syncSourceFromPublisher(self);
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
    publisherSuggestions([]);
    publisherNotFound(false);
    syncSourceFromPublisher(self);
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
    // Subscribe to source/publisher field changes for autocomplete
    blankRefViewModel.source.subscribe(lookupSources);
    blankRefViewModel.publisher.subscribe(lookupPublishers);
    attachOddCharReport(blankRefViewModel);
    ko.applyBindings(blankRefViewModel, $("#newRefModal")[0]);

    var orphanNotice = null;
    try { orphanNotice = sessionStorage.getItem('orphanRefsNotice'); } catch (e) {}
    if (orphanNotice) {
        try { sessionStorage.removeItem('orphanRefsNotice'); } catch (e) {}
        try {
            var n = JSON.parse(orphanNotice);
            var alertEl = document.getElementById('orphanCapAlert');
            if (alertEl) {
                document.getElementById('orphanCapShown').textContent = n.shown;
                document.getElementById('orphanCapTotal').textContent = n.total;
                alertEl.style.display = '';
            }
        } catch (e) {}
    }

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

// Publisher autocomplete (publishers and sources share the sources core)
var publisherSuggestions = ko.observableArray([]);
var publisherNotFound = ko.observable(false);
var _publisherTimer = null;

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

function lookupPublishers(value) {
    if (!value || value.length < 2) {
        publisherSuggestions([]);
        publisherNotFound(false);
        return;
    }
    if (_publisherTimer) { clearTimeout(_publisherTimer); }
    _publisherTimer = setTimeout(function () {
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
                publisherSuggestions(names);
                publisherNotFound(data.response.numFound === 0);
            },
            error: function () {
                publisherSuggestions([]);
                publisherNotFound(false);
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

function selectPublisher(name) {
    var modal = $('.modal.in');
    if (modal.length) {
        var ctx = ko.dataFor(modal.find('form')[0]);
        if (ctx && ctx.publisher) {
            ctx.publisher(name);
        }
    }
    if (_publisherTimer) { clearTimeout(_publisherTimer); _publisherTimer = null; }
    publisherSuggestions([]);
    publisherNotFound(false);
}

// If the user didn't tick "Add separate source", source mirrors publisher.
// Done at submit time so toggling the checkbox off and on while editing
// doesn't blow away a manually-entered source value.
function syncSourceFromPublisher(vm) {
    if (vm && vm.hasSeparateSource && !vm.hasSeparateSource()) {
        vm.source(vm.publisher() || null);
    }
}

// Dismiss source/publisher suggestions when clicking outside their field areas
$(document).on('mousedown', function (e) {
    var $target = $(e.target);
    if (sourceSuggestions().length > 0 || sourceNotFound()) {
        if (!$target.closest('#sourceField, .list-group').length) {
            sourceSuggestions([]);
            sourceNotFound(false);
        }
    }
    if (publisherSuggestions().length > 0 || publisherNotFound()) {
        if (!$target.closest('#publisherField, .list-group').length) {
            publisherSuggestions([]);
            publisherNotFound(false);
        }
    }
});

function createSourceFromRef() {
    openSourceCreatorFromField('source');
}

function createPublisherFromRef() {
    openSourceCreatorFromField('publisher');
}

// Pre-fills the new-source modal with the value from the ref modal's `source`
// or `publisher` field, then hides the ref modal until the source is saved.
// Publishers and sources share the sources core, so creating either is the
// same action — only the source of the pre-filled name changes.
function openSourceCreatorFromField(fieldName) {
    var modal = $('.modal.in');
    var name = '';
    if (modal.length) {
        var ctx = ko.dataFor(modal.find('form')[0]);
        if (ctx && ctx[fieldName]) {
            name = ctx[fieldName]() || '';
        }
    }
    modal.modal('hide');

    var blankSource = new SrcViewModel({ name: name });
    ko.cleanNode($("#newSourceModal")[0]);

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
                publisherNotFound(false);
                publisherSuggestions([]);
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

var BLANK_QUERYABLE_FIELDS = ['author', 'title', 'reference', 'source', 'publisher', 'page', 'abstract', 'dt'];

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

var ODD_CHAR_SEARCH_FIELDS = ['title', 'author', 'abstract', 'reference', 'source', 'publisher', 'page'];

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
// document in the source core. Solr can't join across cores, and putting
// every source name in the URL trips the server's URI length limit, so we
// compute the diff in JS and submit only the (usually small) list of
// orphan IDs.
function searchOrphanSources() {
    var btn = document.getElementById('orphanSourceBtn');
    var progress = document.getElementById('orphanSourceProgress');
    var originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="glyphicon glyphicon-refresh glyphicon-spin"></span>';
    progress.style.display = '';
    progress.textContent = 'Loading sources…';

    var pageSize = 1000;

    function fail(msg) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        progress.style.display = 'none';
        progress.textContent = '';
        alert(msg);
    }

    function fetchAllSourceNames(callback) {
        var names = {};
        var loaded = 0;
        function fetchPage(start) {
            $.ajax({
                url: '/solr/source/select?',
                dataType: 'json',
                data: $.param({ q: '*:*', rows: pageSize, start: start, fl: 'name' }),
                success: function (data) {
                    (data.response.docs || []).forEach(function (d) {
                        var n = d.name;
                        if (Array.isArray(n)) { n = n[0]; }
                        if (n) { names[n] = true; }
                    });
                    loaded += (data.response.docs || []).length;
                    progress.textContent = 'Loading sources… ' + loaded + ' of ' + data.response.numFound;
                    if (start + pageSize >= data.response.numFound) { callback(names); }
                    else { fetchPage(start + pageSize); }
                },
                error: function (jqXHR) { fail('Could not load source list (status ' + jqXHR.status + ').'); }
            });
        }
        fetchPage(0);
    }

    function paginateRefs(sourceSet) {
        var orphanIds = [];
        var scanned = 0;
        function fetchPage(start) {
            $.ajax({
                url: '/solr/rad/refs?',
                dataType: 'json',
                data: $.param({ q: 'source:[* TO *] OR publisher:[* TO *]', rows: pageSize, start: start, fl: 'id,source,publisher' }),
                success: function (data) {
                    (data.response.docs || []).forEach(function (d) {
                        var s = d.source;
                        if (Array.isArray(s)) { s = s[0]; }
                        var p = d.publisher;
                        if (Array.isArray(p)) { p = p[0]; }
                        var sourceOrphan = s && !sourceSet[s];
                        var publisherOrphan = p && !sourceSet[p];
                        if ((sourceOrphan || publisherOrphan) && d.id !== undefined) { orphanIds.push(d.id); }
                    });
                    scanned += (data.response.docs || []).length;
                    progress.textContent = 'Scanning refs… ' + scanned + ' of ' + data.response.numFound;
                    if (start + pageSize >= data.response.numFound) { finish(orphanIds); }
                    else { fetchPage(start + pageSize); }
                },
                error: function (jqXHR) { fail('Could not scan refs (status ' + jqXHR.status + ').'); }
            });
        }
        fetchPage(0);
    }

    function finish(orphanIds) {
        var input = document.getElementById('searchInput');
        if (!orphanIds.length) {
            input.value = '-*:*'; // matches nothing
        } else {
            // Cap to keep URL under server header limits. Editors fix the
            // visible batch, re-run, see the next batch.
            var CAP = 100;
            if (orphanIds.length > CAP) {
                try {
                    sessionStorage.setItem('orphanRefsNotice', JSON.stringify({
                        total: orphanIds.length, shown: CAP
                    }));
                } catch (e) { /* sessionStorage may be unavailable; banner just won't appear */ }
                orphanIds = orphanIds.slice(0, CAP);
            }
            input.value = 'id:(' + orphanIds.join(' OR ') + ')';
        }
        input.form.submit();
    }

    fetchAllSourceNames(paginateRefs);
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
        ['publisher', values.publisher],
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
            publisher: vm.publisher(),
            page: vm.page(), abst: vm.abst()
        });
    });
}

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
