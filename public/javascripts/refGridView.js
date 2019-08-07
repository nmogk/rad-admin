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
    if (new Date().getFullYear() >= 2020) {
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

    $.ajax({
        url: self.refsURI,
        dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
        jsonp: "json.wrf", // This is the name of the function to return. This is magic sauce. I don't know why Solr requires this name to use jsonp
        data: $.param(qString), // Pass along user's input directly as query string. Server handles escaping of searches.
        success: function (data) {
            data.response.docs.forEach( function (refi, i) {
                self.refs.push(new RefViewModel(refi, i));
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
            pageList.setAttribute("class", "pagination");

            // Dynamically create pagination list items given relevant inputs
            // Each list item is a link to the relevant page search, which is specified by the 'start'
            // parameter. 'active' and 'ariaLab' are optional. 'active' is a flag to specify that
            // the formatting should show that page as the current one.
            self.pgList = function (text, start, active, ariaLab) {
                if (active === undefined) {
                    active = false;
                }

                qString.start = start;
                var link = "?" + $.param(qString);
                var listItem = document.createElement("LI");
                if (active) {
                    listItem.setAttribute("class", "active");
                }
                if (ariaLab) {
                    listItem.setAttribute("aria-label", ariaLab);
                }
                var anchor = document.createElement("A");
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
        }
    });

}