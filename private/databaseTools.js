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
});
