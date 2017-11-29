/*!
 * quactus
 * Copyright(c) 2016 Benoît Claveau <benoit.claveau@gmail.com>
 * MIT Licensed
 */
"use strict";

const { Error } = require("oups");

class RouteService {
    constructor() {
    };
    
    index(ask, reply) {
        return reply.forward("/index.html");
    };
};

exports = module.exports = RouteService;