var http = require('http');
var Client = require('node-rest-client').Client

var client = new Client();

var found = 0;
var id = 1;

do {
    client.get('http://localhost:8080/solr/rad/refs?q=id%3A' + id, function (data, response) {
        if(data) {
            found = data.response.numFound;
            id = id + 1;
        } else {
            console.log("No data returned. Problems!")
        }
    });
} while (found)

console.log("Data gap begins at " + id);