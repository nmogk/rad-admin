function UserViewModel(qString) {
    "use strict";
    
    var self = this;
    self.usersURI = "https://" + window.location.host + "/users/all";
    self.users = ko.observableArray();
    
    $.ajax({
        url: self.usersURI,
        dataType: "jsonp",
        jsonp: "callback", 
        success: function (data) {
            data.forEach( function (user) {

                self.users.push({
                    id: user.id,
                    email: ko.observable(user.email),
                    name: ko.observable(user.name),
                    validated: user.validated? "Yes" : "No",
                    perm0: user.permission === 0? "btn btn-primary active disabled" : "btn btn-outline-primary",
                    perm1: user.permission === 1? "btn btn-primary active disabled" : "btn btn-outline-primary",
                    perm2: user.permission === 2? "btn btn-primary active disabled" : "btn btn-outline-primary",
                });
            });
        },
        error: function (jqXHR) {
            console.log("ajax error " + jqXHR.status);
        }
    });

    // Opens the webpage referenced by the source of the reference
    self.delUser = function (user) {
        $.ajax({ // Makes an AJAX query to the server for the source
            url: "https://" + window.location.host + "/users/" + user.id,
            method: "DELETE",
            success: function(){
                window.location.reload(true);
            }
        });
    };

    self.resendInvite = function (user) {
        $.ajax({ // Makes an AJAX query to the server for the source
            url: "https://" + window.location.host + "/users/resend" + user.id,
            method: "POST",
            success: function(){
                window.location.reload(true);
            }
        });
    };

    self.updatePerms = function (newperms, user) {
        console.log("https://" + window.location.host + "/users/" + user.id + "/" + newperms);
        $.ajax({ // Makes an AJAX query to the server for the source
            url: "https://" + window.location.host + "/users/" + user.id + "/" + newperms,
            method: "POST",
            success: function(data){
                window.location.reload(true);
            }
        });
    };
};

//$(document).ready(
$('[data-toggle=confirmation]').confirmation({
    rootSelector: '[data-toggle=confirmation]',
    // other options
    });
ko.applyBindings(new UserViewModel())//);