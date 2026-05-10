/**
 * View model for the source search results grid. Maintains a list of sources
 * as an observable array. Performs JSONP search against the Solr source index
 * and handles pagination.
 * @param qString - javascript object of search query key/value pairs
 */
function SrcGridViewModel(qString) {
    "use strict";

    var self = this;
    self.sourcesURI = "/solr/source/select?";
    self.sources = ko.observableArray();
    self.numResults = ko.observable(0);
    self.start = ko.observable(0);
    self.end = ko.observable(0);

    self.summary = ko.computed( function () {
        return self.start() + " to " + self.end() + " of " + self.numResults() + " results";
    });

    qString.q = decodeURIComponent(qString.q.replace(/[+]/g, " "));
    // HTML-encode characters that may be stored as entities in the Solr index
    qString.q = qString.q.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
    qString.rows = parseInt(qString.rows) || 10;

    $.ajax({
        url: self.sourcesURI,
        dataType: "json",
        data: $.param(qString),
        success: function (data) {
            data.response.docs.forEach( function (src) {
                self.sources.push(new SrcViewModel(src));
            });

            if (data.response.numFound === 0) {
                document.getElementById("noResultsAlert").setAttribute("aria-hidden", "false");
            }

            self.numResults(data.response.numFound);
            self.start(Math.min(data.response.start + 1, data.response.numFound));
            self.end(Math.min(data.response.start + qString.rows, data.response.numFound));

            // Handle pagination
            var pagesNeeded = Math.ceil(data.response.numFound / qString.rows);
            if (pagesNeeded <= 1) {
                return;
            }

            var numShown = Math.min(5, pagesNeeded);
            var currentPage = Math.floor(data.response.start / qString.rows) + 1;
            var lowestPage = currentPage - 2;
            if (currentPage < 3) {
                lowestPage = 1;
            } else if (currentPage > pagesNeeded - 2) {
                lowestPage = Math.max(1, pagesNeeded - 4);
            }

            var pageList = document.createElement("UL");
            pageList.setAttribute("class", "pagination justify-content-center");

            self.pgList = function (text, start, active, ariaLab) {
                if (active === undefined) {
                    active = false;
                }

                qString.start = start;
                var link = "?" + $.param(qString);
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

            if (lowestPage > 1) {
                self.pgList("\u00AB", 0, false, "First page");
            }

            if (currentPage > 1) {
                self.pgList("\u2039", qString.rows * (currentPage - 2), false, "Previous page");
            }

            for (var i = lowestPage; i < lowestPage + numShown; i += 1) {
                self.pgList(i, qString.rows * (i - 1), i === currentPage);
            }

            if (currentPage < pagesNeeded) {
                self.pgList("\u203A", qString.rows * (currentPage), false, "Next page");
            }

            if (qString.rows > 1000 || data.response.start % qString.rows !== 0) {
                document.getElementById("paginationAlert").setAttribute("aria-hidden", "false");
            }

            document.getElementById("pages").insertBefore(pageList, document.getElementById("pageSummary"));
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
        }
    });

}
