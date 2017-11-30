function UserViewModel(qString) {
    "use strict";
    
    var self = this;
    self.usersURI = "https://" + window.location.host + "/users/all";
    self.users = ko.observableArray();
    
    $.ajax({
        url: self.usersURI,
        dataType: "jsonp", // jsonp is to get around cross-origin request issues. Solr server does not handle preflight checks to use CORS
        jsonp: "callback", 
        success: function (data) {
            data.forEach( function (user) {

                self.users.push({
                    id: user.id,
                    email: ko.observable(user.email),
                    name: ko.observable(user.name),
                    validated: ko.observable(user.validated),
                    permission: ko.observable(user.permission)
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
            url: "https://" + window.location.host + "users/" + user.id,
        });
        //window.location.reload(true);
    };

    
};

//$(document).ready(
ko.applyBindings(new UserViewModel())//);