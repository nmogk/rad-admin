var http = require('http');
var async = require('async');
var Client = require('node-rest-client').Client;
var client = new Client();

var found = 0;
var id = parseInt(process.argv[2],10) || 1;

async.doWhilst(
    function(callback){
        client.get('http://localhost:8080/solr/rad/refs?q=id%3A' + id, function (data, response) {
            found = data.response.numFound;
            id = id + 1;
            callback(null, found, id);
        });
    },
    function(){return found;},
    function(err, found, id) {
        console.log("Data gap begins at %d.", id-1);
    }
);