/**
 * Custom binding for an ISO 8601 date picker supporting year, year-month,
 * and full date precision. Syncs with the bound observable.
 *
 * Usage: data-bind="datePicker: date"
 *
 * Admin-only — used in the ref / issue / general-todo edit modals. Lives
 * under /private/ so it's served behind isLoggedIn and isn't shipped to
 * public search visitors.
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
