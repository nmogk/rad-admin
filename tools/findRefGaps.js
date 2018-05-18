var http = require('http');
var Client = require('node-rest-client').Client

var client = new Client();

function runQuery(id, callback) {
    client.get('http://localhost:8080/solr/rad/refs?q=id%3A' + id, function (data, response) {
        if(data && data.response.numFound) {
            callback(id + 1);
        } else {
            return id;
        }
    });
}

function loop(id){
    return runQuery(id, loop);
}

var id = loop(1);
console.log("Data gap begins at " + id);