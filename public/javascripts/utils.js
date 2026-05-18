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

// The datePicker KO binding moved to /private/datePicker.js — it's
// admin-only (used in ref / issue / general-todo edit modals) and not
// needed by the public search page that pulls in utils.js.