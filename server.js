"use strict";

const fs = require("fs");
const http = require("http");
const Qwebs = require("qwebs");
// const Vulcanize = require('vulcanize');
// const crisper = require('crisper');
// const path = require("path");


class Server extends Qwebs {
    // load() {
    //     return super.load().then(() => {
    //         return this.build("index.html").then(html => {
    //             return this.asset("index.html").init(html).then(() => {
    //                 return this.asset("my-view1.html").initFromFile("web/src/my-view1.html").then(() => {
    //                     console.log("loaded")
    //                 });
    //             });
    //         });
    //     });
    // }

    // build(htmlmodule, jsmodule) {
    //     return new Promise((resolve, reject) => {
    //         let vulcanize = new Vulcanize({
    //             abspath: 'web',
    //             implicitStrip: true,
    //             stripComments: false
    //         });
    //         vulcanize.process(htmlmodule, function(err, html) {
    //             if (err) reject(error);
    //             else resolve(html);
    //             // else {
    //             //     console.log("crisper")
    //             //     let out = crisper({
    //             //         source: html,
    //             //         jsFileName: "app.js",
    //             //         scriptInHead: true, // default true
    //             //         onlySplit: false, // default false
    //             //         alwaysWriteScript: false //default false
    //             //     });
    //             //     resolve({
    //             //         html: out.html,
    //             //         js: out.js
    //             //     });
    //             // }
    //         });
    //     });
    // };

    start() {
        console.log("start")
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
    console.error(error.stack);
});
