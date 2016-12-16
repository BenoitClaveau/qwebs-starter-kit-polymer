"use strict";

const Qwebs = require("qwebs");

class Setup {
    constructor() {
        this.qwebs = new Qwebs({dirname: __dirname }); //force dirname
    };

    run() {
        return this.qwebs.load();
    };
};

exports = module.exports = new Setup();