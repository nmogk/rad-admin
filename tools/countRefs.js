var http = require('http');
var async = require('async');
var Client = require('node-rest-client').Client;
var client = new Client();

var max = process.argv[2] || 0;
var count = 0;
var id = 1;

async.whilst(
    function(){return id <= max;},
    function(callback){
        client.get('http://localhost:8080/solr/rad/refs?q=id%3A' + id, function (data, response) {
            count = count + data.response.numFound;
            id = id + 1;
            callback(null, count);
        });
    },
    function(err, count) {
        console.log("Found " + count + " references.");
    }
);