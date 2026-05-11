// Hints recent search queries via a native <datalist>. Reads/writes per-page
// history in localStorage so the index, refs, and sources pages each keep
// their own list — a Solr power query like *:* AND -author:[* TO *] makes
// sense as a hint on /refs but not on the public index page. (#130)
(function () {
    "use strict";
    var input = document.getElementById('searchInput');
    if (!input) { return; }
    var key = input.getAttribute('data-history-key');
    if (!key) { return; }
    var datalist = document.getElementById('searchHistory');
    if (!datalist) { return; }

    var storageKey = 'searchHistory:' + key;
    var MAX_ENTRIES = 20;
    var MAX_LEN = 200;

    function read() {
        try {
            var raw = localStorage.getItem(storageKey);
            if (!raw) { return []; }
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    function write(arr) {
        try { localStorage.setItem(storageKey, JSON.stringify(arr)); }
        catch (e) { /* quota exceeded or storage unavailable */ }
    }

    function populate() {
        var arr = read();
        // Wipe and rebuild rather than diff — the list is at most MAX_ENTRIES
        // long, so the savings from a smarter update are not worth the code.
        datalist.textContent = '';
        arr.forEach(function (q) {
            var opt = document.createElement('option');
            opt.value = q;
            datalist.appendChild(opt);
        });
    }

    function remember(q) {
        if (!q) { return; }
        q = String(q).trim();
        if (!q || q.length > MAX_LEN) { return; }
        var arr = read().filter(function (x) { return x !== q; });
        arr.unshift(q);
        if (arr.length > MAX_ENTRIES) { arr = arr.slice(0, MAX_ENTRIES); }
        write(arr);
    }

    populate();

    // Note: form.submit() called programmatically (e.g. the power-search
    // buttons on /refs) bypasses this listener, so power-query strings don't
    // pollute the hint list — they wouldn't be useful to retype anyway.
    var form = input.form;
    if (form) {
        form.addEventListener('submit', function () {
            remember(input.value);
        });
    }
})();
