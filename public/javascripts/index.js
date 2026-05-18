/**
 * Hides the search results section (if visible) and makes the backstory section visible
 */
function showStory() {
    "use strict";
    // The "aria-hidden" attribute is set to control the style "display" attribute in the html file
    document.getElementById("mainDisplay").setAttribute("aria-hidden", "true");
    document.getElementById("story").setAttribute("aria-hidden", "false");
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('showStoryLink')
            .addEventListener('click', showStory);
});

/**
 * Hides the story section and makes the search results section visible
 */
function hideStory() {
    "use strict";
    // The "aria-hidden" attribute is set to control the style "display" attribute in the html file
    document.getElementById("story").setAttribute("aria-hidden", "true");
    if (parseQuery().q !== undefined) {
      document.getElementById("mainDisplay").setAttribute("aria-hidden", "false");
    }
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('hideStoryButton')
            .addEventListener('click', hideStory);
});

/**
 * Normalises a user-supplied or generated seed into a Solr-field-name-safe
 * suffix: lowercase, non-alphanumerics collapsed to underscores, trimmed and
 * capped. So "Darwin evolution" -> "darwin_evolution", which Solr then uses
 * as the seed for sort=random_darwin_evolution.
 */
function sanitizeSeed(raw) {
    "use strict";
    return String(raw == null ? '' : raw)
        .replace(/\+/g, ' ')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .slice(0, 32);
}

/**
 * Die-button handler. Reads the search bar (or generates a fresh seed if it's
 * empty) and navigates to /?seed=<value>; searchInit then runs the random
 * Solr query on reload.
 */
function rollRandom() {
    "use strict";
    var raw = document.getElementById('searchInput').value;
    var seed = sanitizeSeed(raw);
    if (!seed) {
        seed = Math.random().toString(36).slice(2, 10);
    }
    var rows = document.getElementById('rowsInput').value || '30';
    window.location.search = '?seed=' + encodeURIComponent(seed)
        + '&rows=' + encodeURIComponent(rows);
}

document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('randomButton');
    if (btn) {
        btn.addEventListener('click', rollRandom);
    }
    // The die-button tooltip is on the page from load (not added by a later
    // applyBindings), so initialise tooltip widgets here rather than relying
    // on initBootstrapWidgets() from inside searchInit.
    if (typeof initBootstrapWidgets === 'function') {
        initBootstrapWidgets();
    }
    // Type filter is a Bootstrap-dropdown checkbox group; the button label
    // summarises the selection so the collapsed control reads like a select.
    var typeOptions = document.querySelectorAll('input.type-option');
    Array.prototype.forEach.call(typeOptions, function (cb) {
        cb.addEventListener('change', updateTypeButtonLabel);
    });
    updateTypeButtonLabel();
});

/**
 * Reflects the current type checkbox state into the dropdown's button label
 * so the collapsed control communicates the selection without opening it.
 */
function updateTypeButtonLabel() {
    "use strict";
    var btn = document.getElementById('typeInputButton');
    if (!btn) { return; }
    var checked = Array.prototype.filter.call(
        document.querySelectorAll('input.type-option'),
        function (cb) { return cb.checked; }
    );
    if (checked.length === 0) {
        btn.textContent = 'Any type';
    } else if (checked.length === 1) {
        btn.textContent = checked[0].parentNode.textContent.trim();
    } else {
        btn.textContent = checked.length + ' types selected';
    }
}

/**
 * References are stored as objects whose fields are knockout observables. This function gets the
 * values of a subset of those fields in to a regular object for easier manipulation.
 */
function unpackRef(ref) {
    "use strict";
    return {author: ref.author(), title: ref.title(), reference: ref.reference(), page: ref.page(), source: ref.source(), publisher: ref.publisher(), date: ref.date(), "abstract": ref.abst(), year: ref.year(), type: (ref.type && ref.type()) || '', rev_author: ref.rev_author() || '', rev_title: ref.rev_title() || '', rev_date: ref.rev_date() || '', rev_source: ref.rev_source() || ''};
}


/**
 * Takes as input an array of javascript objects and produces a comma-separated value file from the
 * input. The first object's keys are turned into a header row. Double quotes, commas, and new line
 * characters are properly escaped from input strings. Result is a string containing the proper CSV
 * representation of the input data.
 * @param args - input object containing columnDelimiter (default ','), lineDelimiter (default '\n'), and data which is an array of javascript objects which are to be encoded as CSV
 * @return string containing proper CSV representation of input data, or null if no input received
 */
function convertArrayOfObjectsToCSV(args) {
    "use strict";
    // Return null for no data
    var data = args.data || null;
    if (data === null || !data.length) {
        return null;
    }

    var columnDelimiter = args.columnDelimiter || ","; // Comma column delimiter
    var lineDelimiter = args.lineDelimiter || "\n"; // newline line delimiter (unix)

    // Generate header row
    var keys = Object.keys(data[0]);

    var result = "";
    result += keys.join(columnDelimiter);
    result += lineDelimiter;

    data.forEach(function (item) {
        var ctr = 0;
        keys.forEach(function (key) {
            if (ctr > 0) {
                result += columnDelimiter;
            }

            var sanitized = item[key].replace(/"/g, '""'); // Escape double quotes in input
            if (sanitized.search(/("|,|\n)/g) >= 0) {
                sanitized = '"' + sanitized + '"'; // Quote input if it contains reserved characters
            }

            result += sanitized;
            ctr += 1;
        });
        result += lineDelimiter;
    });

    return result;
}

// Opens the webpage referenced by the source of the reference
RefViewModel.prototype.goSource = function () {
    $.ajax({
        url: "/solr/source/select?",
        dataType: "json",
        data: $.param({"q": this.source()}),
        success: function (data) {
            var src = data.response.docs[0]; // first result only
            if (!src) {
                alert("Source not found!");
                return;
            }
            // `website` is single-valued in the source schema, so it's a string;
            // an older multi-valued schema would hand back an array, hence the guard.
            var site = Array.isArray(src.website) ? src.website[0] : src.website;
            if (site) {
                window.open("http://" + site);
            } else {
                alert("Source does not have a website to go to!");
            }
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
            alert("Unable to go to source webpage at this time!");
        }
    });
};


// Initializes a view model for the formatted citation.
//
// The modal uses a `foreach` over the citation styles list. ko.cleanNode
// clears binding handlers but does NOT remove the <tr>s the foreach
// rendered last time — so on the second open KO would append six fresh
// rows next to the stale ones (each style appearing twice, then three
// times, etc.). We stash the un-rendered template on the first call and
// reset innerHTML before every subsequent applyBindings so the foreach
// starts from a clean slate.
var citationModalTemplate = null;

RefViewModel.prototype.generateCitation = function () {
    var modal = $("#citationModal")[0];
    if (citationModalTemplate === null) {
        citationModalTemplate = modal.innerHTML;
    } else {
        ko.cleanNode(modal);
        modal.innerHTML = citationModalTemplate;
    }
    // Reset enrichment so a previous open's source data doesn't bleed through.
    this.citationSource(null);
    ko.applyBindings(this, modal);
    initBootstrapWidgets(modal);
    new ClipboardJS('.copy', {
        container: document.getElementById('#citationModal')
    });
    bsModalShow("#citationModal");

    // Book / website citations benefit from the full source row (address,
    // website). Kick off a lookup in the background — the modal binding on
    // citationSource() will re-render in place when it arrives. Failures
    // warn to the console and let format() fall back to the raw publisher
    // field; the citation still renders with whatever info is on the ref. (#144)
    var inferred = window.RAD.citations._internals
        ? window.RAD.citations._internals.inferType(unpackRef(this))
        : '';
    var publisher = this.publisher && this.publisher();
    if ((inferred === 'book' || inferred === 'website') && publisher) {
        var self = this;
        // Hit the catch-all _text_ field (no `name:` qualifier) the same
        // way RefViewModel.goSource does — Solr's relevance scoring picks
        // the closest match even when name punctuation/spacing differs.
        $.ajax({
            url: "/solr/source/select?",
            dataType: "json",
            data: $.param({ q: publisher, rows: 1 }),
            success: function (data) {
                var src = data && data.response && data.response.docs && data.response.docs[0];
                if (src) {
                    self.citationSource(src);
                } else {
                    console.warn('Citation enrichment: no source matched publisher "' + publisher + '" (citation will fall back to publisher field only).');
                }
            },
            error: function (jqXHR) {
                console.warn('Citation enrichment: source lookup failed (' + jqXHR.status + ') for publisher "' + publisher + '".');
            }
        });
    }
};

// Adds reference information to localStorage so that it can be printed nicely
// This merely aggregates the references and opens the printAggregator page
RefViewModel.prototype.downloadCitation = function () {
    if (Storage === undefined) {
        alert("HTML5 storage must be available for the print function to work. Try a newer browser.");
        return;
    }
    var self = this;
    // Pre-open the printer window synchronously inside the click handler so
    // popup blockers don't reject a delayed window.open after the abstract
    // fetch resolves. Navigate to the aggregator once localStorage is ready.
    var printer = window.open("about:blank", "printer");
    self.ensureAbstract().always(function () {
        var store = "printRefs";
        var toAdd = [unpackRef(self)];
        var rawStore = localStorage[store];

        if (rawStore) {
            var stored = JSON.parse(rawStore);
            if (Object.prototype.toString.call(stored) === "[object Array]") {
                stored.push(unpackRef(self));
                toAdd = stored;
            }
        }

        localStorage[store] = JSON.stringify(toAdd);
        if (printer) {
            try { printer.location.href = "aggregator.html"; } catch (e) {}
        }
    });
};

// Allows the user to download the entire displayed list of references as CSV
RefsGridViewModel.prototype.downloadList = function () {
    var self = this;

    function buildCsv() {
        var visibleList = self.refs().map(unpackRef);
        var csv = convertArrayOfObjectsToCSV({ data: visibleList });
        if (csv === null) { return; }
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        saveAs(blob, "references_CER.csv");
    }

    // The list query omits `abstract` (refGridView.js fl=…). Pull missing
    // abstracts for the visible page in one round trip so the CSV still
    // carries them, instead of N per-row lazy fetches.
    var pending = self.refs().filter(function (r) { return !r._abstractLoaded; });
    if (pending.length === 0) { buildCsv(); return; }

    var ids = pending.map(function (r) { return r.id(); });
    $.ajax({
        url: '/solr/rad/refs?',
        dataType: 'json',
        data: $.param({ q: 'id:(' + ids.join(' OR ') + ')', fl: 'id,abstract', rows: ids.length })
    }).then(function (data) {
        var byId = {};
        ((data && data.response && data.response.docs) || []).forEach(function (doc) {
            byId[doc.id] = doc.abstract;
        });
        pending.forEach(function (r) {
            r.abst(htmlDecode(byId[r.id()]));
            r._abstractLoaded = true;
        });
        buildCsv();
    }, function () {
        // On Solr failure, still emit the CSV — just without abstracts for
        // un-expanded rows.
        buildCsv();
    });
};

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

    if (queryString.type !== undefined) {
        // The type filter is a Bootstrap-dropdown checkbox group, so the URL
        // can carry several `type=` values. parseQuery only keeps the last
        // (regex overwrites the key), so re-read the raw search via
        // URLSearchParams to recover the full set, check each matching box,
        // refresh the dropdown button label, and overwrite queryString.type
        // with the array so RefsGridViewModel builds the right multi-clause fq.
        var rawTypes = new URLSearchParams(window.location.search).getAll('type');
        Array.prototype.forEach.call(
            document.querySelectorAll('input.type-option'),
            function (cb) { cb.checked = rawTypes.indexOf(cb.value) !== -1; }
        );
        updateTypeButtonLabel();
        queryString.type = rawTypes.length > 1 ? rawTypes : (rawTypes[0] || queryString.type);
    }

    if (queryString.q !== undefined) {
        queryString.q = queryString["q"].replace(/%3A/g, ":"); // Unescape : in query string
        document.getElementById("mainDisplay").setAttribute("aria-hidden", "false"); // Show main body
        document.getElementById("searchInput").value = decodeURIComponent(queryString.q.replace(/[+]/g, "%20")); // Put query back in search bar, unescape special + encoding
        document.getElementById("rowsInput").value = queryString.rows; // Put row setting back in search bar
        ko.applyBindings(new RefsGridViewModel(queryString), $("#mainDisplay")[0]);
        initBootstrapWidgets();
        return;
    }

    // Random-mode: ?seed= present and no explicit q. Drive the same grid view
    // model with q=*:* and a sort param that Solr's RandomSortField shuffles by.
    if (queryString.seed !== undefined) {
        var seed = sanitizeSeed(decodeURIComponent(queryString.seed));
        if (!seed) { return; }
        var rows = queryString.rows || '30';
        var start = queryString.start || '0';
        document.getElementById("searchInput").value = seed;
        document.getElementById("rowsInput").value = rows;
        document.getElementById("mainDisplay").setAttribute("aria-hidden", "false");
        // `seed` is a marker the view-model uses to build clean ?seed=&start=
        // pagination links; refGridView strips it before sending to Solr.
        ko.applyBindings(new RefsGridViewModel({
            q: '*:*',
            sort: 'random_' + seed + ' asc',
            rows: rows,
            start: start,
            seed: seed
        }), $("#mainDisplay")[0]);
        initBootstrapWidgets();
    }
}

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());