"use strict";

const fs = require("fs");
const http = require("http");
const Qwebs = require("qwebs");
const Vulcanize = require('vulcanize');
const crisper = require('crisper');
const path = require("path");

class Server extends Qwebs {
    start() {
        return this.load().then(() => {
            let $config = this.resolve("$config");
            http.createServer((request, response) => {
                return this.invoke(request, response).catch(error => {
                    return response.send(error);
                });
            }).listen($config.http.port);
            console.log("http server created on", $config.http.port);
        });
    }
};

let server = new Server();
server.start().catch(error => {
    console.error(error.message);
    console.error(error.data);
    console.error(error.stack);
});
