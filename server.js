"use strict";

const fs = require("fs");
const http = require("http");
const Qwebs = require("qwebs");
    
let qwebs = new Qwebs();
qwebs.load().then(function() {
    let $config = qwebs.resolve("$config");
    http.createServer((request, response) => {
        return qwebs.invoke(request, response).catch(error => {
            return response.send({ statusCode: 404, content: error });
        });
    }).listen($config.http.port);
    console.log("http server created on", $config.http.port);
}).catch(error => {
    console.log("FATAL: -----------------------");
    console.log(error);
    console.log(error.stack);
    throw error;
});