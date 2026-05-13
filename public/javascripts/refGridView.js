/**
 * View model for references, which is the main point of the website. Maintains a list of references
 * as an observable array. This is a single page of results. No displayable elements are set at initial
 * construction. All visible elements are set in a callback which performs the relevant search on the
 * search server. Also sets up dynamic behavior associated with each reference.
 * @param qString - javascript array of search query key/value pairs
 */
function RefsGridViewModel(qString) {
    "use strict";
    // Set a reminder for updating the hard coded constants in the search configuration.
    if (new Date().getFullYear() >= 2028) {
        console.log("Warning: automatic date prioritization of documents is hard coded for a certain time in the future. Update or search functionality may break soon.");
    }

    var self = this;
    self.refsURI = "/solr/rad/refs?";
    self.refs = ko.observableArray();
    self.spellings = ko.observableArray();
    self.numResults = ko.observable(0);
    self.start = ko.observable(0);
    self.end = ko.observable(0);
    
    self.summary = ko.computed( function () {
        return self.start() + " to " + self.end() + " of " + self.numResults() + " results";
    });

   
    qString.q = decodeURIComponent(qString.q.replace(/[+]/g, " "));
    qString.rows = parseInt(qString.rows) || 10; // This default value needs to be the same as specified in solrconfig.xml or things will get weird.

    // Translate the user-facing `type=…` URL param into a Solr fq filter so it
    // narrows results without affecting the relevance score (#19). The index
    // page's type select is `multiple`, so qString.type can be a string (one
    // pick) or an array (many) — collapse to an array and OR the clauses
    // inside a single fq so any selected type matches. Strip type from qString
    // afterwards so the Solr request doesn't see a stray top-level `type`.
    var solrParams = $.extend({}, qString);
    var types = Array.isArray(solrParams.type)
        ? solrParams.type
        : (solrParams.type ? [solrParams.type] : []);
    if (types.length > 0) {
        var clauses = types.map(function (t) {
            var decoded = decodeURIComponent(String(t).replace(/[+]/g, " ")).replace(/"/g, '\\"');
            return 'type:"' + decoded + '"';
        });
        solrParams.fq = clauses.length === 1 ? clauses[0] : '(' + clauses.join(' OR ') + ')';
    }
    delete solrParams.type;
    // `seed` is an index-page marker for random-mode pagination — it isn't a
    // Solr param (sort=random_<seed> asc is what drives the ordering).
    delete solrParams.seed;

    $.ajax({
        url: self.refsURI,
        dataType: "json",
        data: $.param(solrParams), // Pass along user's input directly as query string. Server handles escaping of searches.
        success: function (data) {
            data.response.docs.forEach( function (refi) {
                self.refs.push(new RefViewModel(refi));
            });

            // Generate spelling suggestions
            var termTemp;
            if (data.spellcheck !== undefined) {
              data.spellcheck.suggestions.forEach( function (el, i) {
                  // Suggestions are returned as an array of alternating terms and an object which contains suggestions
                  if (i % 2 === 0) {
                      termTemp = el;
                      return;
                  }
                  self.spellings.push({
                      term: ko.observable(termTemp),
                      suggestions: ko.observableArray(el.suggestion)
                  });
              });
            }

            if (data.response.numFound === 0) {
                document.getElementById("noResultsAlert").setAttribute("aria-hidden", "false");
            }
            if (self.spellings().length > 0) {
                document.getElementById("spellingSuggestions").setAttribute("aria-hidden", "false");
            }

            // Generate summary of search (number of results)
            self.numResults(data.response.numFound);
            self.start(Math.min(data.response.start + 1, data.response.numFound));
            self.end(Math.min(data.response.start + qString.rows, data.response.numFound));
            
            // Handle pagination
            var pagesNeeded = Math.ceil(data.response.numFound / qString.rows);
            if (pagesNeeded <= 1) { // End now if there are no pages
                return;
            }

            var numShown = Math.min(5, pagesNeeded); // Show up to 5 pages, but no more than there are
            var currentPage = Math.floor(data.response.start / qString.rows) + 1;
            var lowestPage = currentPage - 2;   // Display two pages below the current page
            if (currentPage < 3) {              // ...unless there aren't that many below
                lowestPage = 1;
            } else if (currentPage > pagesNeeded - 2) { // If we are at the end of the page list, display five pages from the end
                lowestPage = Math.max(1, pagesNeeded - 4);
            }

            var pageList = document.createElement("UL");
            pageList.setAttribute("class", "pagination justify-content-center");

            // Dynamically create pagination list items given relevant inputs
            // Each list item is a link to the relevant page search, which is specified by the 'start'
            // parameter. 'active' and 'ariaLab' are optional. 'active' is a flag to specify that
            // the formatting should show that page as the current one.
            self.pgList = function (text, start, active, ariaLab) {
                if (active === undefined) {
                    active = false;
                }

                var link;
                if (qString.seed) {
                    // Random-mode: build a clean ?seed=…&rows=…&start=… link.
                    // Avoids carrying q=*:* and sort=random_<seed> asc through
                    // the URL, where $.param's re-encoding of the space inside
                    // `sort` would otherwise break Solr's field-name parsing.
                    link = "?seed=" + encodeURIComponent(qString.seed)
                         + "&rows=" + encodeURIComponent(qString.rows)
                         + "&start=" + encodeURIComponent(start);
                } else {
                    qString.start = start;
                    // `true` selects jQuery's "traditional" encoding so an
                    // array value (e.g. type=['technical','review']) serialises
                    // to `type=technical&type=review` rather than `type[]=…`,
                    // matching the natural form-submit shape.
                    link = "?" + $.param(qString, true);
                }
                var listItem = document.createElement("LI");
                listItem.setAttribute("class", active ? "page-item active" : "page-item");
                if (ariaLab) {
                    listItem.setAttribute("aria-label", ariaLab);
                }
                var anchor = document.createElement("A");
                anchor.setAttribute("class", "page-link");
                anchor.setAttribute("href", link);
                anchor.appendChild(document.createTextNode(text));
                listItem.appendChild(anchor);
                pageList.appendChild(listItem);
            };

            if (lowestPage > 1) { // Add "first page" button if needed (first page link not visible)
                self.pgList("«", 0, false, "First page");
            }

            if (currentPage > 1) { // Add "previous page" button if not on the first page
                self.pgList("‹", qString.rows * (currentPage - 2), false, "Previous page");
            }

            for (var i = lowestPage; i < lowestPage + numShown; i += 1) { // Add page buttons
                self.pgList(i, qString.rows * (i - 1), i === currentPage);
            }

            if (currentPage < pagesNeeded) { // Add "next page" button if not on the last page
                self.pgList("›", qString.rows * (currentPage), false, "Next page");
            }

            // Warn users about large requests or pagination misalignment if applicable
            // Large queries are supposed to be restricted by the server, so the client needs to know.
            if (qString.rows > 1000 || data.response.start % qString.rows !== 0) {
                document.getElementById("paginationAlert").setAttribute("aria-hidden", "false");
            }

            document.getElementById("pages").insertBefore(pageList, document.getElementById("pageSummary"));
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
        },
        complete: function () {
            restoreEditScroll();
        }
    });

}

// Restore the user's scroll position and flash the edited row after submitEdits
// reloads /refs. The submit handler in private/refs.js writes {y, refId, url,
// time} to sessionStorage; we apply it only when the URL still matches and the
// entry is recent so a stale tab doesn't jump unexpectedly.
function restoreEditScroll() {
    var raw;
    try { raw = sessionStorage.getItem('refsEditScroll'); }
    catch (e) { return; }
    if (!raw) { return; }
    try { sessionStorage.removeItem('refsEditScroll'); } catch (e) {}

    var state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    if (!state) { return; }

    var hereUrl = window.location.pathname + window.location.search;
    if (state.url !== hereUrl) { return; }
    if (!state.time || (Date.now() - state.time) > 60000) { return; }

    // setTimeout(0) lets KO finish rendering the foreach against the just-
    // populated observableArray so the document is tall enough for the scroll.
    setTimeout(function () {
        if (typeof state.y === 'number') { window.scrollTo(0, state.y); }
        if (state.refId !== undefined && state.refId !== null) {
            var row = document.querySelector('[data-ref-id="' + state.refId + '"]');
            if (row) {
                row.classList.add('ref-edit-highlight');
                setTimeout(function () { row.classList.remove('ref-edit-highlight'); }, 2000);
            }
        }
    }, 0);
}