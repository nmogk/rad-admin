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
 * Decodes an html escaped string into a regular string with special characters.
 */
function htmlDecode(value) {
    "use strict";
    return $("<textarea/>").html(value).text();
}

/**
 * Wraps a string as a Solr quoted phrase, escaping backslashes and quotes
 * so the value can be substituted into queries like name:"<phrase>".
 */
function escapeSolrPhrase(value) {
    "use strict";
    if (typeof value !== 'string') { return '""'; }
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Custom binding which supplies a default value (em dash) for observables with undefined values
 */
ko.bindingHandlers.textPretty = {
    update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
        var value = valueAccessor();
        var text = ko.unwrap(value) || "\u2014";
        ko.bindingHandlers.text.update(element, function() { return text; });
    }
};

/**
 * Custom binding for an ISO 8601 date picker supporting year, year-month,
 * and full date precision. Syncs with the bound observable.
 *
 * Usage: data-bind="datePicker: date"
 */
ko.bindingHandlers.datePicker = {
    init: function (element, valueAccessor) {
        var observable = valueAccessor();

        // Clear any previously created UI (handles re-binding after ko.cleanNode)
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }

        // --- Build UI ---
        var row = document.createElement('div');
        row.className = 'form-inline';

        var precisionSelect = document.createElement('select');
        precisionSelect.className = 'form-control';
        precisionSelect.style.marginRight = '8px';
        [['year', 'Year'], ['month', 'Year-Month'], ['date', 'Full Date']].forEach(function (pair) {
            var opt = document.createElement('option');
            opt.value = pair[0];
            opt.textContent = pair[1];
            precisionSelect.appendChild(opt);
        });

        var yearInput = document.createElement('input');
        yearInput.type = 'number';
        yearInput.className = 'form-control';
        yearInput.placeholder = 'YYYY';
        yearInput.min = '1';
        yearInput.max = '9999';
        yearInput.style.width = '100px';

        var monthInput = document.createElement('input');
        monthInput.type = 'month';
        monthInput.className = 'form-control';

        var dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = 'form-control';

        row.appendChild(precisionSelect);
        row.appendChild(yearInput);
        row.appendChild(monthInput);
        row.appendChild(dateInput);
        element.appendChild(row);

        // --- Helpers ---
        function showForPrecision(precision) {
            yearInput.style.display = precision === 'year' ? '' : 'none';
            monthInput.style.display = precision === 'month' ? '' : 'none';
            dateInput.style.display = precision === 'date' ? '' : 'none';
        }

        function parseISO(val) {
            if (!val) return { precision: 'date', year: '', month: '', date: '' };
            val = String(val).trim();
            // Full date: 2025-06-15 or longer (with time)
            if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
                return { precision: 'date', year: '', month: val.substring(0, 7), date: val.substring(0, 10) };
            }
            // Year-month: 2025-06
            if (/^\d{4}-\d{2}$/.test(val)) {
                return { precision: 'month', year: '', month: val, date: '' };
            }
            // Year only: 2025
            if (/^\d{1,4}$/.test(val)) {
                return { precision: 'year', year: val, month: '', date: '' };
            }
            // Fallback: treat as full date
            return { precision: 'date', year: '', month: '', date: val };
        }

        function writeValue() {
            var p = precisionSelect.value;
            var val = '';
            if (p === 'year') {
                val = yearInput.value;
            } else if (p === 'month') {
                val = monthInput.value; // yyyy-MM
            } else {
                val = dateInput.value; // yyyy-MM-dd
            }
            observable(val || null);
        }

        function readValue() {
            var parsed = parseISO(ko.unwrap(observable));
            precisionSelect.value = parsed.precision;
            yearInput.value = parsed.year;
            monthInput.value = parsed.month;
            dateInput.value = parsed.date;
            showForPrecision(parsed.precision);
        }

        // --- Event handlers ---
        precisionSelect.addEventListener('change', function () {
            showForPrecision(precisionSelect.value);
            writeValue();
        });
        yearInput.addEventListener('input', writeValue);
        monthInput.addEventListener('change', writeValue);
        dateInput.addEventListener('change', writeValue);

        // --- Initial population ---
        readValue();

        // --- Subscribe to external changes (revert, update) ---
        observable.subscribe(function () {
            readValue();
        });

        // Cleanup on node removal
        ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
            precisionSelect.removeEventListener('change', showForPrecision);
            yearInput.removeEventListener('input', writeValue);
            monthInput.removeEventListener('change', writeValue);
            dateInput.removeEventListener('change', writeValue);
        });
    }
};