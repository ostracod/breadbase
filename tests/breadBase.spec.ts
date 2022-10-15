
import { BreadBase } from "../src/breadBase.js"

describe("BreadBase", () => {
    describe("load", () => {
        it("passes", () => {
            const breadBase = new BreadBase();
            console.log(breadBase);
            expect(2).toEqual(2);
        });
    });
});


