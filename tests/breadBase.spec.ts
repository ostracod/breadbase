
import { spanDegreeAmount, AllocType } from "../src/constants.js";
import { storageHeaderType, spanType, emptySpanType, allocType } from "../src/builtTypes.js";
import { MemoryStorage } from "../src/storage.js"
import { StoragePointer, createNullPointer } from "../src/storagePointer.js"
import { BreadBase } from "../src/breadBase.js"

const storageHeaderSize = storageHeaderType.getSize();
const nullSpanPointer = createNullPointer(spanType);
const nullEmptySpanPointer = createNullPointer(emptySpanType);

describe("BreadBase", () => {
    describe("createEmptyDb", () => {
        it("creates a list of empty spans", async () => {
            const breadBase = new BreadBase();
            const storage = new MemoryStorage();
            await breadBase.initWithStorage(storage);
            expect(breadBase.emptySpansByDegree.length).toEqual(spanDegreeAmount);
            expect(breadBase.finalSpan.index).toEqual(storageHeaderType.getSize());
            expect(storage.getSize()).toEqual(
                storageHeaderSize + emptySpanType.getSize(),
            );
        });
    });
    
    describe("createAlloc", () => {
        it("splits final span", async () => {
            const breadBase = new BreadBase();
            const storage = new MemoryStorage();
            await breadBase.initWithStorage(storage);
            await breadBase.createAlloc(AllocType.Node, 50);
            const finalSpanPointer = new StoragePointer(
                storageHeaderSize + 73,
                emptySpanType,
            );
            expect(breadBase.finalSpan).toEqual(finalSpanPointer);
            const alloc = await storage.read(
                new StoragePointer(storageHeaderSize, allocType),
            );
            expect(alloc).toEqual({
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                spanSize: 55,
                degree: 3,
                isEmpty: false,
                type: 1,
                allocSize: 50,
            });
            const finalSpan = await storage.read(finalSpanPointer);
            expect(finalSpan).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize, spanType),
                nextByNeighbor: nullSpanPointer,
                spanSize: -1,
                degree: -1,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
        });
    });
});


