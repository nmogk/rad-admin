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
 * References are stored as objects whose fields are knockout observables. This function gets the
 * values of a subset of those fields in to a regular object for easier manipulation.
 */
function unpackRef(ref) {
    "use strict";
    return {author: ref.author(), title: ref.title(), reference: ref.reference(), page: ref.page(), source: ref.source(), publisher: ref.publisher(), date: ref.date(), "abstract": ref.abst(), year: ref.year(), rev_author: ref.rev_author() || '', rev_title: ref.rev_title() || '', rev_date: ref.rev_date() || '', rev_source: ref.rev_source() || ''};
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
    ko.applyBindings(this, modal);
    new ClipboardJS('.copy', {
        container: document.getElementById('#citationModal')
    });
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
        window.open("aggregator.html", "printer");
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

    if (queryString.type !== undefined) {
        document.getElementById("typeInput").value = decodeURIComponent(queryString.type.replace(/[+]/g, "%20"));
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