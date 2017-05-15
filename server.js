"use strict";

const Qwebs = require("qwebs");
const process = require("process");

let qwebs = new Qwebs();
let $config = qwebs.resolve("$config");
$config.http.port = process.env.PORT || $config.http.port;
qwebs.load();
