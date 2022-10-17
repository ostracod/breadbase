
import { spanDegreeAmount } from "../src/constants.js";
import { storageHeaderType } from "../src/structs.js";
import { MemoryStorage } from "../src/storage.js"
import { BreadBase } from "../src/breadBase.js"

describe("BreadBase", () => {
    describe("createEmptyDb", () => {
        it("creates a list of empty spans", async () => {
            const breadBase = new BreadBase();
            const storage = new MemoryStorage();
            await breadBase.initWithStorage(storage);
            expect(breadBase.emptySpans.length).toEqual(spanDegreeAmount);
            expect(storage.getSize()).toEqual(storageHeaderType.getSize());
        });
    });
});


