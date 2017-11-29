"use strict";

const process = require("process");
const Qwebs = require("qwebs");

process.on("unhandledRejection", (reason, p) => {
    console.error("Unhandled Rejection at:", p, "reason:", reason);
});

async function start(){
    let qwebs = new Qwebs({});    
    await qwebs.load();
    console.log("started")
}
start();

