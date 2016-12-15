/*!
 * quactus
 * Copyright(c) 2016 Benoît Claveau
 * MIT Licensed
 */
"use strict";

const DataError = require("qwebs").DataError;

class RouteService {
    constructor($qwebs) {
        this.$qwebs = $qwebs;
    };
    
    index(request, response) {
        return this.$qwebs.invoke(request, response, "/index.html");
    };
};

exports = module.exports = RouteService;