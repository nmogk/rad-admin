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
 * BS5 modal helpers. Take a CSS selector, DOM node, or jQuery object and
 * return / drive the corresponding bootstrap.Modal instance. Replaces the
 * BS3 jQuery plugin shim (`$('#x').modal('show')`) which is gone in BS5.
 */
function bsModalEl(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    if (target.jquery) return target[0] || null;
    if (target.nodeType) return target;
    return null;
}
function bsModal(target, options) {
    var el = bsModalEl(target);
    if (!el) return null;
    return bootstrap.Modal.getOrCreateInstance(el, options || {});
}
function bsModalShow(target, options) {
    var inst = bsModal(target, options);
    if (inst) inst.show();
    return inst;
}
function bsModalHide(target) {
    var inst = bsModal(target);
    if (inst) inst.hide();
    return inst;
}

/**
 * Initialises every [data-bs-toggle="tooltip"] and [data-bs-toggle="popover"]
 * inside `root` (defaults to document). BS5 widgets are opt-in, so this must
 * run after the DOM is built and after every ko.applyBindings that brings
 * tooltip/popover triggers into the tree.
 */
function initBootstrapWidgets(root) {
    root = bsModalEl(root) || document;
    root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
        bootstrap.Tooltip.getOrCreateInstance(el);
    });
    root.querySelectorAll('[data-bs-toggle="popover"]').forEach(function (el) {
        bootstrap.Popover.getOrCreateInstance(el);
    });
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
 * Shows the shared #confirmModal partial with custom title/body/button label
 * and invokes onConfirm only when the user clicks the confirm button. Falls
 * back to the native window.confirm if the partial isn't on the page.
 *
 *   confirmDialog({title, body, confirmText, confirmClass}, function () { ... });
 */
function confirmDialog(opts, onConfirm) {
    "use strict";
    opts = opts || {};
    var modalEl = document.getElementById('confirmModal');
    if (!modalEl || !window.bootstrap || !bootstrap.Modal) {
        if (window.confirm(opts.body || 'Are you sure?')) { onConfirm(); }
        return;
    }
    $('#confirmModalTitle').text(opts.title || 'Confirm');
    $('#confirmModalBody').text(opts.body || '');
    var $btn = $('#confirmModalConfirm');
    $btn.text(opts.confirmText || 'Confirm');
    // The class lives on the button so callers can swap btn-info for btn-danger
    // on destructive actions; keep btn so Bootstrap's base styles apply.
    $btn.attr('class', 'btn ' + (opts.confirmClass || 'btn-info'));
    $btn.off('click.confirmDialog').on('click.confirmDialog', function () {
        bsModalHide(modalEl);
        onConfirm();
    });
    bsModalShow(modalEl);
}

// Cached <script src=…> loader for lazy-loading on demand. Returns a
// Promise that resolves once the script has executed; concurrent / repeat
// calls share the same load. A failed load is evicted from the cache so
// the caller can retry on the next user gesture. CSP `strict-dynamic` on
// `script-src` means dynamically inserted scripts inherit trust from the
// nonce'd scripts that created them, so no nonce attribute is needed.
var _scriptLoadPromises = {};
function loadScript(src) {
    if (_scriptLoadPromises[src]) return _scriptLoadPromises[src];
    _scriptLoadPromises[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = function () { resolve(); };
        s.onerror = function () {
            delete _scriptLoadPromises[src];
            reject(new Error('Failed to load ' + src));
        };
        document.head.appendChild(s);
    });
    return _scriptLoadPromises[src];
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

        // type='text' (not 'number') because number inputs accept e/E and signs
        // and don't clamp `max` until form submit. Pattern + JS guard below
        // restrict to 4 digits. (#112)
        var yearInput = document.createElement('input');
        yearInput.type = 'text';
        yearInput.inputMode = 'numeric';
        yearInput.className = 'form-control';
        yearInput.placeholder = 'YYYY';
        yearInput.maxLength = 4;
        yearInput.style.width = '100px';

        var monthInput = document.createElement('input');
        monthInput.type = 'month';
        // Firefox and Safari don't support <input type="month"> — they
        // silently degrade to text with no placeholder and no calendar
        // icon. Detect the fallback (the assigned .type stays 'text' on
        // unsupported browsers) and add YYYY-MM hints so editors can
        // still see the expected format. (#133)
        if (monthInput.type !== 'month') {
            monthInput.type = 'text';
            monthInput.inputMode = 'numeric';
            monthInput.placeholder = 'YYYY-MM';
            monthInput.pattern = '\\d{4}-\\d{2}';
            monthInput.maxLength = 7;
        }
        monthInput.className = 'form-control';

        var dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = 'form-control';

        row.appendChild(precisionSelect);
        row.appendChild(yearInput);
        row.appendChild(monthInput);
        row.appendChild(dateInput);
        element.appendChild(row);

        // Non-standard mode: shown when the bound value can't be parsed as
        // ISO 8601. Lets editors see and correct legacy values rather than
        // silently losing them in <input type="date"> rejection. (#112)
        var rawWrapper = document.createElement('div');
        rawWrapper.className = 'form-inline';
        rawWrapper.style.marginTop = '4px';
        rawWrapper.style.display = 'none';

        var rawNotice = document.createElement('span');
        rawNotice.className = 'text-warning';
        rawNotice.style.marginRight = '8px';
        rawNotice.textContent = 'Non-standard date — edit as text or convert:';

        var rawInput = document.createElement('input');
        rawInput.type = 'text';
        rawInput.className = 'form-control';
        rawInput.style.marginRight = '8px';

        var convertBtn = document.createElement('button');
        convertBtn.type = 'button';
        convertBtn.className = 'btn btn-secondary btn-sm';
        convertBtn.textContent = 'Convert to standard date';

        rawWrapper.appendChild(rawNotice);
        rawWrapper.appendChild(rawInput);
        rawWrapper.appendChild(convertBtn);
        element.appendChild(rawWrapper);

        // --- Helpers ---
        function showForPrecision(precision) {
            var standard = precision !== 'unknown';
            row.style.display = standard ? '' : 'none';
            rawWrapper.style.display = standard ? 'none' : '';
            if (standard) {
                yearInput.style.display = precision === 'year' ? '' : 'none';
                monthInput.style.display = precision === 'month' ? '' : 'none';
                dateInput.style.display = precision === 'date' ? '' : 'none';
            }
        }

        function parseISO(val) {
            if (!val) return { precision: 'date', year: '', month: '', date: '', raw: '' };
            val = String(val).trim();
            // Populate year/month/date for ALL precisions, padding missing
            // pieces with -01 (Jan / day 1). When the user switches the
            // precision dropdown, the about-to-be-shown input is already
            // filled in, so writeValue writes a sensible value rather than
            // an empty string that the subscribe would parse back to the
            // default and snap the dropdown around. (#134)
            //
            // Full date: 2025-06-15 or longer (with time)
            if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
                return {
                    precision: 'date',
                    year: val.substring(0, 4),
                    month: val.substring(0, 7),
                    date: val.substring(0, 10),
                    raw: ''
                };
            }
            // Year-month: 2025-06
            if (/^\d{4}-\d{2}$/.test(val)) {
                return {
                    precision: 'month',
                    year: val.substring(0, 4),
                    month: val,
                    date: val + '-01',
                    raw: ''
                };
            }
            // Year only: 2025
            if (/^\d{1,4}$/.test(val)) {
                // <input type="date|month"> require a 4-digit year, so pad
                // the synthesized month/date even when the year is shorter.
                // The yearInput stays as the user entered it.
                var year4 = ('0000' + val).slice(-4);
                return {
                    precision: 'year',
                    year: val,
                    month: year4 + '-01',
                    date: year4 + '-01-01',
                    raw: ''
                };
            }
            // Unparseable — preserve raw so the editor can see and correct it
            // rather than silently losing it. (#112)
            return { precision: 'unknown', year: '', month: '', date: '', raw: val };
        }

        // Set while a user-driven DOM event is propagating into the observable.
        // Without this, picking a precision on an empty field writes null, the
        // subscribe below re-runs readValue, parseISO(null) defaults to 'date',
        // and the dropdown snaps back to "Full Date" — requiring a second click
        // (with a year typed in between) to switch precision. (#145 follow-up
        // to #134.)
        var writingFromUI = false;

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
            writingFromUI = true;
            observable(val || null);
            writingFromUI = false;
        }

        function writeRawValue() {
            // In non-standard mode, observable holds the raw text verbatim so
            // unchanged legacy values round-trip cleanly through edit + save.
            writingFromUI = true;
            observable(rawInput.value || null);
            writingFromUI = false;
        }

        function readValue() {
            var parsed = parseISO(ko.unwrap(observable));
            if (parsed.precision === 'unknown') {
                rawInput.value = parsed.raw;
                showForPrecision('unknown');
            } else {
                precisionSelect.value = parsed.precision;
                yearInput.value = parsed.year;
                monthInput.value = parsed.month;
                dateInput.value = parsed.date;
                showForPrecision(parsed.precision);
            }
        }

        // --- Event handlers ---
        var onPrecisionChange = function () {
            showForPrecision(precisionSelect.value);
            writeValue();
        };
        var onYearInput = function () {
            // Strip non-digits (covers e/E/sign/decimal that text inputs allow)
            // and clamp to 4 digits before writing to the observable. (#112)
            var cleaned = yearInput.value.replace(/[^0-9]/g, '').slice(0, 4);
            if (cleaned !== yearInput.value) {
                yearInput.value = cleaned;
            }
            writeValue();
        };
        var onConvertClick = function () {
            // User wants to leave non-standard mode: clear the raw value and
            // switch to picker mode, ready for them to enter a standard date.
            rawInput.value = '';
            observable(null);
            precisionSelect.value = 'date';
            showForPrecision('date');
        };

        precisionSelect.addEventListener('change', onPrecisionChange);
        yearInput.addEventListener('input', onYearInput);
        monthInput.addEventListener('change', writeValue);
        dateInput.addEventListener('change', writeValue);
        rawInput.addEventListener('input', writeRawValue);
        convertBtn.addEventListener('click', onConvertClick);

        // --- Initial population ---
        // readValue() only updates DOM, not the observable, so a non-standard
        // load keeps the original value intact until the user edits it.
        readValue();

        // --- Subscribe to external changes (revert, update) ---
        var sub = observable.subscribe(function () {
            if (writingFromUI) { return; }
            readValue();
        });

        // Cleanup on node removal. Stash handler refs so removeEventListener
        // actually finds them (the previous version passed an inline anonymous
        // function that was never registered, leaking listeners across modal
        // re-opens).
        ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
            precisionSelect.removeEventListener('change', onPrecisionChange);
            yearInput.removeEventListener('input', onYearInput);
            monthInput.removeEventListener('change', writeValue);
            dateInput.removeEventListener('change', writeValue);
            rawInput.removeEventListener('input', writeRawValue);
            convertBtn.removeEventListener('click', onConvertClick);
            sub.dispose();
        });
    }
};