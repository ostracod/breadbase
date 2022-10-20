
import { spanDegreeAmount } from "../src/constants.js";
import { storageHeaderType, spanHeaderType, emptySpanHeaderType } from "../src/builtTypes.js";
import { MemoryStorage } from "../src/storage.js"
import { BreadBase } from "../src/breadBase.js"

describe("BreadBase", () => {
    describe("createEmptyDb", () => {
        it("creates a list of empty spans", async () => {
            const breadBase = new BreadBase();
            const storage = new MemoryStorage();
            await breadBase.initWithStorage(storage);
            expect(breadBase.emptySpansByDegree.length).toEqual(spanDegreeAmount);
            expect(breadBase.finalSpan.index).toEqual(storageHeaderType.getSize());
            expect(storage.getSize()).toEqual(
                storageHeaderType.getSize() + emptySpanHeaderType.getSize(),
            );
        });
    });
});


