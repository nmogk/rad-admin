var http = require('http');
var async = require('async');
var Client = require('node-rest-client').Client;
var client = new Client();

var found = 0;
var id = parseInt(process.argv[2],10) || 0;

async.doWhilst(
    function(callback){
        client.get('http://localhost:8080/solr/rad/refs?q=id%3A' + id, function (data, response) {
            found = data.response.numFound;
            id = id - 1;
            callback(null, found, id);
        });
    },
    function(){return !found || id <= 0;},
    function(err, found, id) {
        console.log("Highest ID is %d.", id+1);
    }
);