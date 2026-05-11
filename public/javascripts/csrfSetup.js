// Forwards the per-request CSRF token (rendered into <meta name="csrf-token">
// by the layout) on every jQuery AJAX request. Server-side csrf-csrf validates
// the header against the signed cookie issued on the matching GET. Every
// existing $.ajax({ type: 'POST'/'DELETE', ... }) call inherits this with no
// per-call changes.
(function () {
    "use strict";
    if (typeof $ === 'undefined' || !$.ajaxSetup) { return; }
    $.ajaxSetup({
        beforeSend: function (xhr, settings) {
            var method = ((settings && (settings.type || settings.method)) || 'GET').toUpperCase();
            if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') { return; }
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) { xhr.setRequestHeader('x-csrf-token', meta.getAttribute('content')); }
        }
    });
})();
