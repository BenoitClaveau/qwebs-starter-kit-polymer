/*!
 * quactus
 * Copyright(c) 2016 Benoît Claveau
 * MIT Licensed
 */
"use strict";

class UserRoute {
    constructor() {
    };
    
    getList() {
        return Promise.resolve().then(() => {
            return [
                { login: "paul" },
                { login: "pierre" }
            ]
        });
    };
};

exports = module.exports = UserRoute;