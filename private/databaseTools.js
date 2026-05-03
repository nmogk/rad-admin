$(function () {
    "use strict";

    var base = "https://" + window.location.host;

    $('#createBackupForm').on('submit', function (e) {
        e.preventDefault();
        var core = $('#backupCore').val();
        var $btn = $('#createBackupButton');
        var $status = $('#backupStatus');
        $btn.prop('disabled', true);
        $status.text('Creating backup… this may take a while.');

        $.ajax({
            url: base + '/database/backup',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ core: core }),
            success: function (data) {
                window.location.href = data.redirect || '/database';
            },
            error: function (jqXHR) {
                $btn.prop('disabled', false);
                var msg = (jqXHR.responseJSON && jqXHR.responseJSON.error) || 'Backup failed.';
                $status.text(msg);
            }
        });
    });

    var pendingDelete = null;

    $('.delete-backup').on('click', function () {
        pendingDelete = $(this).data('filename');
        $('#deleteBackupName').text(pendingDelete);
        $('#deleteBackupConfirm').modal('show');
    });

    $('#confirm-delete-backup-button').on('click', function () {
        if (!pendingDelete) return;
        var name = pendingDelete;
        pendingDelete = null;
        $.ajax({
            url: base + '/database/backup/' + encodeURIComponent(name),
            method: 'DELETE',
            success: function (data) {
                window.location.href = data.redirect || '/database';
            },
            error: function () {
                window.location.reload(true);
            }
        });
    });

    $('#recomputeStatsForm').on('submit', function (e) {
        e.preventDefault();
        var $btn = $('#recomputeStatsButton');
        var $status = $('#recomputeStatus');
        $btn.prop('disabled', true);
        $status.text('Scanning the rad core… this may take a while.');

        $.ajax({
            url: base + '/database/recompute',
            method: 'POST',
            success: function (data) {
                $btn.prop('disabled', false);
                $status.text('');
                showRecomputeResult(data);
            },
            error: function (jqXHR) {
                $btn.prop('disabled', false);
                var msg = (jqXHR.responseJSON && jqXHR.responseJSON.error) || 'Recompute failed.';
                $status.text(msg);
            }
        });
    });

    function showRecomputeResult(data) {
        var $summary = $('#recomputeSummary');
        var $table = $('#recomputeChangesTable');
        var $body = $('#recomputeChangesBody');
        $body.empty();

        if (!data.changed) {
            $summary.text('Stats already match the index — no changes made. Current values: numRecords=' +
                data.current.numRecords + ', highestId=' + data.current.highestId +
                ', latest=' + (data.current.latest || '(none)') + '.');
            $table.hide();
        } else {
            $summary.text('database.json updated. Changed fields:');
            Object.keys(data.changes).forEach(function (k) {
                var c = data.changes[k];
                var fromVal = c.from === undefined || c.from === null ? '(none)' : c.from;
                var toVal = c.to === undefined || c.to === null ? '(none)' : c.to;
                $body.append('<tr><td>' + k + '</td><td>' + fromVal + '</td><td>' + toVal + '</td></tr>');
            });
            $table.show();
        }
        $('#recomputeResult').modal('show');
    }
});
