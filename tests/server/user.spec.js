"use strict";

const setup = require("./setup");

describe("A suite for user service", () => {

    it("setup", done => {
        return setup.run().catch(error => {
            expect(error.stack).toBeNull();
        }).then(() => {
        }).then(done);
    }, 5000);

    it("getList", done => {
        let $user = setup.qwebs.resolve("$user");
        return $user.getList().then(users => {
            expect(users.length).toEqual(2);
            expect(users[0].login).toEqual("paul");
            expect(users[1].login).toEqual("pierre");
        }).catch(error => {
            expect(error.stack).toBeNull();
        }).then(() => {
            done();
        });
    });
});

