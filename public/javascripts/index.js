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
 * References are stored as objects whose fields are knockout observables. This function gets the
 * values of a subset of those fields in to a regular object for easier manipulation.
 */
function unpackRef(ref) {
    "use strict";
    return {author: ref.author(), title: ref.title(), reference: ref.reference(), page: ref.page(), source: ref.source(), date: ref.date(), "abstract": ref.abst(), year: ref.year()};
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
    $.ajax({ // Makes an AJAX query to the server for the source
        url: "/solr/source/select?",
        dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
        jsonp: "json.wrf", // This is the name of the function to return. This is magic sauce. I don't know why Solr requires this name to use jsonp
        data: $.param({"q": this.source()}),
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


// Initializes a view model for the formatted citation
RefViewModel.prototype.generateCitation = function () {
    ko.cleanNode($("#citationModal")[0]) // Must clear bindings in newer version of KO
    ko.applyBindings(this, $("#citationModal")[0]);
    $("#citationModal").modal("show");
};

// Adds reference information to localStorage so that it can be printed nicely
// This merely aggregates the references and opens the printAggregator page
RefViewModel.prototype.downloadCitation = function () {
    if (Storage !== undefined) {
        var store = "printRefs";
        var toAdd = [unpackRef(this)]; // If no current list (empty storage or something other than an array) this will be added
        var rawStore = localStorage[store];

        if (rawStore) {
            var stored = JSON.parse(localStorage[store]);
            if (Object.prototype.toString.call(stored) === "[object Array]") { // Parse and add new reference
                stored.push(unpackRef(this));
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
RefsGridViewModel.prototype.downloadList = function () {
    var visibleList = [];

    this.refs().forEach(function (ref) {
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
        ko.applyBindings(new RefsGridViewModel(queryString), $("#mainDisplay")[0]);
    }
}

// Make sure the whole page is loaded before manipulating it
$(document).ready(searchInit());