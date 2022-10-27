
import { spanDegreeAmount, AllocType } from "../src/constants.js";
import { storageHeaderType, spanType, emptySpanType, allocType } from "../src/builtTypes.js";
import { MemoryStorage } from "../src/storage.js";
import { StoragePointer, createNullPointer } from "../src/storagePointer.js";
import { HeapAllocator } from "../src/heapAllocator.js";

const storageHeaderSize = storageHeaderType.getSize();
const nullSpanPointer = createNullPointer(spanType);
const nullEmptySpanPointer = createNullPointer(emptySpanType);

describe("HeapAllocator", () => {
    describe("createEmptyHeap", () => {
        it("creates a list of empty spans", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            expect(allocator.emptySpansByDegree.length).toEqual(spanDegreeAmount);
            expect(allocator.finalSpan.index).toEqual(storageHeaderType.getSize());
            expect(storage.getSize()).toEqual(
                storageHeaderSize + emptySpanType.getSize(),
            );
        });
    });
    
    describe("createAlloc", () => {
        it("splits final span", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            const allocPointer = await allocator.createAlloc(AllocType.Node, 50);
            expect(allocPointer).toEqual(new StoragePointer(storageHeaderSize, allocType));
            const finalSpanPointer = new StoragePointer(
                storageHeaderSize + 73,
                emptySpanType,
            );
            expect(allocator.finalSpan).toEqual(finalSpanPointer);
            const alloc = await allocator.read(allocPointer);
            expect(alloc).toEqual({
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                spanSize: 55,
                degree: 3,
                isEmpty: false,
                type: 1,
                allocSize: 50,
            });
            const finalSpan = await allocator.read(finalSpanPointer);
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
        
        it("splits non-final span", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 200);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            const allocPointer3 = await allocator.createAlloc(AllocType.Node, 50);
            expect(allocPointer3).toEqual(new StoragePointer(storageHeaderSize, allocType));
            const alloc3 = await allocator.read(allocPointer3);
            expect(alloc3).toEqual({
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                spanSize: 55,
                degree: 3,
                isEmpty: false,
                type: 1,
                allocSize: 50,
            });
            const emptySpanPointer = new StoragePointer(
                storageHeaderSize + 73,
                emptySpanType,
            );
            const emptySpan = await allocator.read(emptySpanPointer);
            expect(emptySpan).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 223, spanType),
                spanSize: 132,
                degree: 6,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
            expect(allocator.emptySpansByDegree[8]).toEqual(nullEmptySpanPointer);
            expect(allocator.emptySpansByDegree[6]).toEqual(emptySpanPointer);
        });
        
        it("does not split non-final span", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 65);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            const allocPointer3 = await allocator.createAlloc(AllocType.Node, 50);
            expect(allocPointer3).toEqual(new StoragePointer(storageHeaderSize, allocType));
            const alloc3 = await allocator.read(allocPointer3);
            expect(alloc3).toEqual({
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: new StoragePointer(storageHeaderSize + 88, spanType),
                spanSize: 70,
                degree: 4,
                isEmpty: false,
                type: 1,
                allocSize: 50,
            });
        });
        it("does not use gap which is too small", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            const allocPointer3 = await allocator.createAlloc(AllocType.Node, 70);
            expect(allocPointer3).toEqual(
                new StoragePointer(storageHeaderSize + 146, allocType),
            );
            const alloc3 = await allocator.read(allocPointer3);
            expect(alloc3).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 239, spanType),
                spanSize: 75,
                degree: 4,
                isEmpty: false,
                type: 1,
                allocSize: 70,
            });
        });
    });
    
    describe("deleteAlloc", () => {
        it("merges with final span", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            const allocPointer = await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer);
            const finalSpanPointer = new StoragePointer(storageHeaderSize, emptySpanType);
            expect(allocator.finalSpan).toEqual(finalSpanPointer);
            const finalSpan = await allocator.read(finalSpanPointer);
            expect(finalSpan).toEqual({
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: nullSpanPointer,
                spanSize: -1,
                degree: -1,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
        });
        
        it("deletes alloc at beginning", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 200);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            const emptySpanPointer = new StoragePointer(storageHeaderSize, emptySpanType);
            const emptySpan = await allocator.read(emptySpanPointer);
            expect(emptySpan).toEqual({
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: new StoragePointer(storageHeaderSize + 223, spanType),
                spanSize: 205,
                degree: 8,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
            expect(allocator.emptySpansByDegree[8]).toEqual(emptySpanPointer);
        });
        
        it("deletes alloc between two allocs", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            const emptySpan = await allocator.read(
                new StoragePointer(storageHeaderSize + 146, emptySpanType),
            );
            expect(emptySpan).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 219, spanType),
                spanSize: 55,
                degree: 3,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
        });
        
        it("deletes alloc before alloc", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer2 = await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer3 = await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            await allocator.deleteAlloc(allocPointer2);
            const emptySpan = await allocator.read(
                new StoragePointer(storageHeaderSize + 73, emptySpanType),
            );
            expect(emptySpan).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 219, spanType),
                spanSize: 128,
                degree: 6,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
            const alloc3 = await allocator.read(allocPointer3);
            expect(alloc3).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 292, spanType),
                spanSize: 55,
                degree: 3,
                isEmpty: false,
                type: 1,
                allocSize: 50,
            });
        });
        
        it("deletes alloc after alloc", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer2 = await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer2);
            await allocator.deleteAlloc(allocPointer1);
            const emptySpan = await allocator.read(
                new StoragePointer(storageHeaderSize + 146, emptySpanType),
            );
            expect(emptySpan).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize + 73, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 292, spanType),
                spanSize: 128,
                degree: 6,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
        });
        
        it("merges two empty spans", async () => {
            const storage = new MemoryStorage();
            const allocator = new HeapAllocator(storage);
            await allocator.createEmptyHeap();
            await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer1 = await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer2 = await allocator.createAlloc(AllocType.Node, 50);
            const allocPointer3 = await allocator.createAlloc(AllocType.Node, 50);
            await allocator.createAlloc(AllocType.Node, 50);
            await allocator.deleteAlloc(allocPointer1);
            await allocator.deleteAlloc(allocPointer3);
            await allocator.deleteAlloc(allocPointer2);
            const emptySpan = await allocator.read(
                new StoragePointer(storageHeaderSize + 73, emptySpanType),
            );
            expect(emptySpan).toEqual({
                previousByNeighbor: new StoragePointer(storageHeaderSize, spanType),
                nextByNeighbor: new StoragePointer(storageHeaderSize + 292, spanType),
                spanSize: 201,
                degree: 8,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            });
        });
    });
});


