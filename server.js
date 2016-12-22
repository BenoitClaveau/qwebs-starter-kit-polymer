"use strict";

const fs = require("fs");
const http = require("http");
const Qwebs = require("qwebs");
const Vulcanize = require('vulcanize');
const crisper = require('crisper');
const path = require("path");

class Server extends Qwebs {
    // load() {
    //     return super.load().then(() => {
    //         var promises = [];
    //         ["index.html", 
    //         "bower_components/polymer/polymer.html",
    //         "bower_components/polymer/polymer-mini.html",
    //         "bower_components/polymer/polymer-micro.html",
    //         "bower_components/webcomponentsjs/webcomponents-lite.js"].forEach(module => {
    //             promises.push(this.asset(module).initFromFile(__dirname + "/web/" + module));
    //         });
    //         return Promise.all(promises);
    //     }).then(() => {
    //         var promises = [];
    //         ["/src/my-app.html", 
    //         "/src/my-view1.html",
    //         "/src/my-view2.html",
    //         "/src/my-view3.html",
    //         "/src/my-view404.html"].forEach(module => {
    //             promises.push(this.build(module).then(build => {
    //                 console.log(build.jsmodule, build.module)
    //                 return Promise.all([
    //                     this.asset(build.module).init(build.html),
    //                     this.asset(build.jsmodule).init(build.js)
    //                 ]);
    //             }));
    //         });
    //         return Promise.all(promises);
    //     });
    // }

    // build(module) {
    //     return new Promise((resolve, reject) => {
    //         let vulcanize = new Vulcanize({
    //             abspath: path.resolve('./web'),
    //             inlineCss: true,
    //             inlineScript: true,
    //             stripExcludes: false,
    //             excludes: [
    //                 "\\bower_components/polymer/polymer.html",
    //                 "\\bower_components/polymer/polymer-micro.html",
    //                 "\\src/shared-styles.html"
    //             ]
    //         });
    //         vulcanize.process(module, function(err, html) {
    //             if (err) reject(error);
    //             // else {
    //             //     resolve({
    //             //         html: html,
    //             //         module: module
    //             //     });
    //             // }
    //             else {
    //                 let basename = path.basename(module, ".html");
    //                 let dirname = path.dirname(module);
    //                 let jsname = basename + ".js";
    //                 let jsmodule = path.join(dirname, jsname).replace(/\\/gi, "/");
                    
    //                 let out = crisper({
    //                     source: html,
    //                     jsFileName: jsname,
    //                     scriptInHead: true, // default true
    //                     onlySplit: false, // default false
    //                     alwaysWriteScript: false //default false
    //                 });
    //                 resolve({
    //                     js: out.js,
    //                     html: out.html,
    //                     module: module,
    //                     jsmodule: jsmodule
    //                 });
    //             }
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
    console.error(error.data);
    console.error(error.stack);
});
