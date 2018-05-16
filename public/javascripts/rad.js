/**
 * Hides the search results section (if visible) and makes the backstory section visible
 */
function showStory() {
    "use strict";
    // The "aria-hidden" attribute is set to control the style "display" attribute in the html file
    document.getElementById("mainDisplay").setAttribute("aria-hidden", "true");
    document.getElementById("story").setAttribute("aria-hidden", "false");
}

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

/**
 * Populates an object with the parameters of the query string
 */
function parseQuery(){
    "use strict";
    var queryString = {};
    window.location.search.replace(
        new RegExp("([^?=&]+)(=([^&]*))?", "g"), // Splits query string capture group $1 contains each key, $3 each value
        function ($0, $1, $2, $3) {
            queryString[$1] = $3;
        }
    );
    return queryString;
}

/**
 * References are stored as objects whose fields are knockout observables. This function gets the
 * values of a subset of those fields in to a regular object for easier manipulation.
 */
function unpackRef(ref) {
    "use strict";
    return {author: ref.author(), title: ref.title(), reference: ref.reference(), page: ref.page(), source: ref.source(), date: ref.date(), "abstract": ref.abst(), year: ref.year()};
}

/**
 * Decodes an html escaped string into a regular string with special characters.
 */
function htmlDecode(value) {
    "use strict";
    return $("<textarea/>").html(value).text();
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

/**
 * View model for source information. Sources are kept in a separate index which is searched when
 * needed.
 * @param name - name of reference to query
 */
function SourceViewModel(name) {
    "use strict";
    var self = this;

    // Ref process, take care of null values and unbox from arrays
    // Boxing in arrays occurs when fields indexed in Solr are listed as multivalued
    self.refP = function (field) {
        if (field === undefined) {
            return "\u2014";
        }
        return htmlDecode(field.join(", "));
    };

    var dunno = "Searching..."; // AJAX call may take some time, so a temporary message is displayed for all fields

    self.name = ko.observable(name);
    self.phone = ko.observable(dunno);
    self.fax = ko.observable(dunno);
    self.email = ko.observable(dunno);
    self.web = ko.observable(dunno);
    self.street = ko.observable(dunno);
    self.city = ko.observable(dunno);
    self.state = ko.observable(dunno);
    self.zip = ko.observable(dunno);

    self.address = ko.computed( function () {
        if (self.city() === dunno || self.city() === "\u2014") {
            return self.city();
        }
        return self.street() + ", " + self.city() + ", " + self.state() + " " + self.zip();
    });

    $.ajax({
        url: "http://rad.creationeducation.org:8008/solr/source/select?", // solr-proxy running on port 8008
        dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
        jsonp: "json.wrf", // This is the name of the function to return. This is magic sauce. I don't know why Solr requires this name to use jsonp
        data: $.param({"q": name}), // Server on backend is set up to search name field by default... I think
        success: function (data) {
            var find = data.response.docs[0]; // update information to first result
            self.name(self.refP(find.name));
            self.street(self.refP(find.address));
            self.city(self.refP(find.city));
            self.state(self.refP(find.state));
            self.zip(self.refP(find.zip));
            self.phone(self.refP(find.telephone));
            self.fax(self.refP(find.fax));
            self.email(self.refP(find.email));
            self.web(self.refP(find.website));
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
        }
    });
}

/**
 * Simple view model for formatted citations. Contains all of the basic info fields. Formatting is
 * determined by the html view.
 * @param ref - a simple javascript object which contains the relevant information
 */
function CitationView(ref) {
    "use strict";
    var self = this;

    self.author = ko.observable(ref.author);
    self.title = ko.observable(ref.title);
    self.reference = ko.observable(ref.reference);
    self.source = ko.observable(ref.source);
    self.page = ko.observable(ref.page);
    self.year = ko.observable(ref.year);
}

/**
 * View model for references, which is the main point of the website. Maintains a list of references
 * as an observable array. This is a single page of results. No displayable elements are set at initial
 * construction. All visible elements are set in a callback which performs the relevant search on the
 * search server. Also sets up dynamic behavior associated with each reference.
 * @param qString - javascript array of search query key/value pairs
 */
function RefsViewModel(qString) {
    "use strict";
    // Set a reminder for updating the hard coded constants in the search configuration.
    if (new Date().getFullYear() >= 2020) {
        console.log("Warning: automatic date prioritization of documents is hard coded for a certain time in the future. Update or search functionality may break soon.");
    }

    var self = this;
    self.refsURI = "http://rad.creationeducation.org:8008/solr/rad/refs?";
    self.refs = ko.observableArray();
    self.spellings = ko.observableArray();
    self.numResults = ko.observable(0);
    self.start = ko.observable(0);
    self.end = ko.observable(0);
    
    self.summary = ko.computed( function () {
        return self.start() + " to " + self.end() + " of " + self.numResults() + " results";
    });

    // Ref process, take care of null values
    self.refP = function (field) {
        if (field === undefined) {
            return "\u2014";
        }
        return htmlDecode(field);
    };

    qString.q = decodeURIComponent(qString.q.replace(/[+]/g, " "));
    qString.rows = parseInt(qString.rows) || 10; // This default value needs to be the same as specified in solrconfig.xml or things will get weird.

    $.ajax({
        url: self.refsURI,
        dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
        jsonp: "json.wrf", // This is the name of the function to return. This is magic sauce. I don't know why Solr requires this name to use jsonp
        data: $.param(qString), // Pass along user's input directly as query string. Server handles escaping of searches.
        success: function (data) {
            data.response.docs.forEach( function (refi, i) {
                var pageTitle = "Page"; // Most references list how many pages they are
                if (/(DVD|CD|cassette)/i.test(refi.reference)) { // Some references refer to media runtime instead
                    pageTitle = "Run Time";
                }

                self.refs.push({
                    author: ko.observable(self.refP(refi.author)),
                    title: ko.observable(self.refP(refi.title)),
                    date: ko.observable(self.refP(refi.dt)),
                    reference: ko.observable(self.refP(refi.reference)),
                    source: ko.observable(self.refP(refi.source)),
                    page: ko.observable(self.refP(refi.page)),
                    abst: ko.observable(self.refP(refi.abstract)),
                    id: ko.observable(self.refP(refi.id)),
                    year: ko.observable(self.refP(refi.year)),
                    colId: "collapse" + (i + 1), // Needed to associate header and collapse
                    ariaLab: "reshead" + (i + 1),
                    pageTitle: pageTitle
                });
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

    // Opens the webpage referenced by the source of the reference
    self.goSource = function (ref) {
        $.ajax({ // Makes an AJAX query to the server for the source
            url: "http://" + window.location.hostname + ":8008/solr/source/select?",
            dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
            jsonp: "json.wrf", // This is the name of the function to return. This is magic sauce. I don't know why Solr requires this name to use jsonp
            data: $.param({"q": ref.source()}),
            success: function (data) {
                var src = data.response.docs[0]; // first result only
                if (src.website !== undefined) {
                    window.open("http://" + src.website[0]);
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

    // Opens a modal dialog with the source information
    self.sourceModal = function (ref) {
        ko.applyBindings(new SourceViewModel(ref.source()), $("#sourceModal")[0]); // AJAX call is done in SourceViewModel constructor
        $("#sourceModal").modal("show");
    };

    // Initializes a view model for the formatted citation
    self.generateCitation = function (ref) {
        ko.applyBindings(new CitationView(unpackRef(ref)), $("#citationModal")[0]);
        $("#citationModal").modal("show");
    };

    // Adds reference information to localStorage so that it can be printed nicely
    // This merely aggregates the references and opens the printAggregator page
    self.downloadCitation = function (ref) {
        if (Storage !== undefined) {
            var store = "printRefs";
            var toAdd = [unpackRef(ref)]; // If no current list (empty storage or something other than an array) this will be added
            var rawStore = localStorage[store];

            if (rawStore) {
                var stored = JSON.parse(localStorage[store]);
                if (Object.prototype.toString.call(stored) === "[object Array]") { // Parse and add new reference
                    stored.push(unpackRef(ref));
                    toAdd = stored;
                }
            }

            localStorage[store] = JSON.stringify(toAdd);
            window.open("printAggregator.html", "printer");
        } else {
            alert("HTML5 storage must be available for the print function to work. Try a newer browser.");
        }
    };

    // Allows the user to download the entire displayed list of references as CSV
    self.downloadList = function () {
        var visibleList = [];

        self.refs().forEach(function (ref) {
            visibleList.push(unpackRef(ref));
        });

        var csv = convertArrayOfObjectsToCSV({
            data: visibleList
        });
        if (csv === null) {
            return;
        }

        var filename = "references_CER.csv"; // Default filename

        var blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
        saveAs(blob, filename);

    };
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
    
    if (queryString.q !== undefined) {
        queryString.q = queryString["q"].replace(/%3A/g, ":"); // Unescape : in query string
        document.getElementById("mainDisplay").setAttribute("aria-hidden", "false"); // Show main body
        document.getElementById("searchInput").value = decodeURIComponent(queryString.q.replace(/[+]/g, "%20")); // Put query back in search bar, unescape special + encoding
        document.getElementById("rowsInput").value = queryString.rows; // Put row setting back in search bar
        ko.applyBindings(new RefsViewModel(queryString), $("#mainDisplay")[0]);
    }
}

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());