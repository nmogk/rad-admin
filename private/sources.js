/**
 * Provides functionality for deleting a source on the server
 */
SrcViewModel.prototype.deleteSource = function () {
    // Forward the current page's query string so the server's redirect lands
    // back on the user's active search rather than an empty /sources page.
    $.ajax({
        url: "/sources/" + this.id() + window.location.search,
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
        url: "/sources/" + self.id() + window.location.search,
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

// Builds and submits a search for sources not used by any ref. Solr can't
// join across cores, and putting every used name in the URL trips the
// server's URI length limit, so we compute the diff in JS and submit only
// the (usually small) list of unused source IDs.
function searchUnusedSources() {
    var btn = document.getElementById('unusedSourceBtn');
    var progress = document.getElementById('unusedSourceProgress');
    var originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="glyphicon glyphicon-refresh glyphicon-spin"></span>';
    progress.style.display = '';
    progress.textContent = 'Scanning refs…';

    var pageSize = 1000;

    function fail(msg) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        progress.style.display = 'none';
        progress.textContent = '';
        alert(msg);
    }

    function fetchUsedSourceNames(callback) {
        var used = {};
        var scanned = 0;
        function fetchPage(start) {
            $.ajax({
                url: '/solr/rad/refs?',
                dataType: 'json',
                data: $.param({ q: 'source:[* TO *] OR publisher:[* TO *]', rows: pageSize, start: start, fl: 'source,publisher' }),
                success: function (data) {
                    (data.response.docs || []).forEach(function (d) {
                        var s = d.source;
                        if (Array.isArray(s)) { s = s[0]; }
                        if (s) { used[s] = true; }
                        var p = d.publisher;
                        if (Array.isArray(p)) { p = p[0]; }
                        if (p) { used[p] = true; }
                    });
                    scanned += (data.response.docs || []).length;
                    progress.textContent = 'Scanning refs… ' + scanned + ' of ' + data.response.numFound;
                    if (start + pageSize >= data.response.numFound) { callback(used); }
                    else { fetchPage(start + pageSize); }
                },
                error: function (jqXHR) { fail('Could not scan refs (status ' + jqXHR.status + ').'); }
            });
        }
        fetchPage(0);
    }

    function paginateSources(usedSet) {
        var unusedIds = [];
        var scanned = 0;
        function fetchPage(start) {
            $.ajax({
                url: '/solr/source/select?',
                dataType: 'json',
                data: $.param({ q: '*:*', rows: pageSize, start: start, fl: 'id,name' }),
                success: function (data) {
                    (data.response.docs || []).forEach(function (d) {
                        var n = d.name;
                        if (Array.isArray(n)) { n = n[0]; }
                        if (n && !usedSet[n] && d.id) { unusedIds.push(d.id); }
                    });
                    scanned += (data.response.docs || []).length;
                    progress.textContent = 'Scanning sources… ' + scanned + ' of ' + data.response.numFound;
                    if (start + pageSize >= data.response.numFound) { finish(unusedIds); }
                    else { fetchPage(start + pageSize); }
                },
                error: function (jqXHR) { fail('Could not scan sources (status ' + jqXHR.status + ').'); }
            });
        }
        fetchPage(0);
    }

    function finish(unusedIds) {
        var input = document.getElementById('searchInput');
        if (!unusedIds.length) {
            input.value = '-*:*'; // matches nothing
        } else {
            // Source IDs are UUIDs containing hyphens (a Solr metachar), so quote.
            var quoted = unusedIds.map(escapeSolrPhrase);
            input.value = 'id:(' + quoted.join(' OR ') + ')';
        }
        input.form.submit();
    }

    fetchUsedSourceNames(paginateSources);
}

$(document).on('click', '#unusedSourceBtn', function () {
    searchUnusedSources();
});

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());
