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

// Builds and submits a search for sources whose `name` is not used by any
// ref's `source` field. Two-step flow because Solr can't join across cores.
// First tries faceting on rad's source field; falls back to paginated scan
// if the response looks tokenized (text-analyzed field, not string).
function searchUnusedSources() {
    var btn = document.getElementById('unusedSourceBtn');
    var originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="glyphicon glyphicon-refresh"></span>';

    function finish(usedNames) {
        var phrases = usedNames.map(escapeSolrPhrase);
        var input = document.getElementById('searchInput');
        if (!phrases.length) {
            input.value = 'name:[* TO *]';
        } else {
            input.value = 'name:[* TO *] AND -name:(' + phrases.join(' OR ') + ')';
        }
        input.form.submit();
    }

    function fail(msg) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        alert(msg);
    }

    function paginateScan() {
        var pageSize = 1000;
        var seen = {};
        function fetchPage(start) {
            $.ajax({
                url: '/solr/rad/refs?',
                dataType: 'json',
                data: $.param({ q: 'source:[* TO *]', rows: pageSize, start: start, fl: 'source' }),
                success: function (data) {
                    var docs = (data.response && data.response.docs) || [];
                    docs.forEach(function (d) {
                        var s = d.source;
                        if (Array.isArray(s)) { s = s[0]; }
                        if (s) { seen[s] = true; }
                    });
                    var total = data.response.numFound;
                    if (start + pageSize >= total) {
                        finish(Object.keys(seen));
                    } else {
                        fetchPage(start + pageSize);
                    }
                },
                error: function (jqXHR) { fail('Could not scan refs (status ' + jqXHR.status + ').'); }
            });
        }
        fetchPage(0);
    }

    // Try faceting first.
    $.ajax({
        url: '/solr/rad/refs?',
        dataType: 'json',
        data: $.param({
            q: 'source:[* TO *]',
            rows: 0,
            facet: 'true',
            'facet.field': 'source',
            'facet.limit': -1,
            'facet.mincount': 1
        }),
        success: function (data) {
            var ff = data.facet_counts && data.facet_counts.facet_fields && data.facet_counts.facet_fields.source;
            if (!Array.isArray(ff) || ff.length === 0) { paginateScan(); return; }
            // facet_fields.source is alternating [term, count, term, count, ...]
            var names = [];
            for (var i = 0; i < ff.length; i += 2) {
                if (typeof ff[i] === 'string' && ff[i].length) { names.push(ff[i]); }
            }
            // Heuristic: a tokenized field gives many short single-word terms.
            // If every term is a single token with no spaces and there are
            // a lot of them, fall back to paginated scan.
            var hasSpace = names.some(function (n) { return n.indexOf(' ') !== -1; });
            if (!hasSpace && names.length > 20) { paginateScan(); return; }
            finish(names);
        },
        error: function () { paginateScan(); }
    });
}

$(document).on('click', '#unusedSourceBtn', function () {
    searchUnusedSources();
});

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
