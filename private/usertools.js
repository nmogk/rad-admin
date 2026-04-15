function UserViewModel(qString) {
    "use strict";

    var self = this;
    self.usersURI = "https://" + window.location.host + "/users/all";
    self.users = ko.observableArray();
    self.currentUserId = parseInt(document.getElementById('mainDisplay').getAttribute('data-current-user-id'), 10);

    $.ajax({
        url: self.usersURI,
        dataType: "jsonp",
        jsonp: "callback",
        success: function (data) {
            data.forEach(function (user) {

                self.users.push({
                    id: user.id,
                    email: ko.observable(user.email),
                    name: ko.observable(user.name),
                    validated: user.validated ? "Yes" : "No",
                    lastLogin: user.last_login ? new Date(user.last_login).toLocaleString() : "Never",
                    isSelf: user.id === self.currentUserId,
                    perm0: user.permission === 0 ? "btn btn-primary active disabled" : "btn btn-outline-primary",
                    perm1: user.permission === 1 ? "btn btn-primary active disabled" : "btn btn-outline-primary",
                    perm2: user.permission === 2 ? "btn btn-primary active disabled" : "btn btn-outline-primary",
                });
            });
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
        }
    });

    function showSelfWarning(title, message, onConfirm) {
        $('#selfActionWarningTitle').text(title);
        $('#selfActionWarningMessage').text(message);
        $('#selfActionWarning').modal('show');
        $('#confirm-self-action-button').off('click').one('click', function () {
            $('#selfActionWarning').modal('hide');
            onConfirm();
        });
    }

    self.delUser = function (user) {
        if (user.isSelf) {
            showSelfWarning(
                'Delete your own account?',
                'You are about to delete your own account. You will be logged out immediately and will no longer have access to the admin interface. This cannot be undone.',
                function () { performDelete(user); }
            );
        } else {
            $( "#deleteUserConfirm" ).modal('show');

            $('#deleteUserConfirm .modal-footer button').on('click', function(event) {
                var $button = $(event.target);

                $(this).closest('.modal').one('hidden.bs.modal', function() {
                    if($button[0].id === 'confirm-delete-button') {
                        performDelete(user);
                    }
                });
            });
        }
    };

    function performDelete(user) {
        $.ajax({
            url: "https://" + window.location.host + "/users/" + user.id,
            method: "DELETE",
            success: function (data) {
                if (user.isSelf) {
                    window.location.href = '/logout';
                } else {
                    window.location.reload(true);
                }
            }
        });
    }

    self.resendInvite = function (user) {
        $.ajax({ // Makes an AJAX query to the server for the source
            url: "https://" + window.location.host + "/users/resend/" + user.id,
            method: "POST",
            success: function () {
                window.location.reload(true);
            }
        });
    };

    self.updatePerms = function (newperms, user) {
        if (user.isSelf && newperms < 2) {
            showSelfWarning(
                'Reduce your own permissions?',
                'You are about to remove your own superuser access. You will no longer be able to manage users or undo this change yourself.',
                function () { performUpdatePerms(newperms, user); }
            );
        } else {
            performUpdatePerms(newperms, user);
        }
    };

    function performUpdatePerms(newperms, user) {
        $.ajax({
            url: "https://" + window.location.host + "/users/" + user.id + "/" + newperms,
            method: "POST",
            success: function (data) {
                if (user.isSelf && newperms < 2) {
                    window.location.href = '/profile';
                } else {
                    window.location.reload(true);
                }
            }
        });
    }
};

ko.applyBindings(new UserViewModel());
