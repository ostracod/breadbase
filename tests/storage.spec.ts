
import { TailStruct } from "../src/internalTypes.js";
import { boolType, IntType, TailStructType } from "../src/dataType.js"
import { StoragePointer } from "../src/storagePointer.js";
import { MemoryStorage } from "../src/storage.js"

describe("MemoryStorage", () => {
    describe("setSize", () => {
        it("changes the size of storage", async () => {
            const storage = new MemoryStorage();
            expect(storage.getSize()).toEqual(0);
            await storage.setSize(20);
            expect(storage.getSize()).toEqual(20);
        });
    });
    
    describe("writeBuffer", () => {
        it("changes values in storage", async () => {
            const storage = new MemoryStorage();
            await storage.setSize(20);
            await storage.writeBuffer(10, Buffer.from([11, 22]));
            await storage.writeBuffer(15, Buffer.from([33, 44]));
            expect(
                (await storage.readBuffer(10, 2)).compare(Buffer.from([11, 22])),
            ).toEqual(0);
            expect(
                (await storage.readBuffer(15, 2)).compare(Buffer.from([33, 44])),
            ).toEqual(0);
        });
    });
    
    describe("readTailStruct", () => {
        interface MyTailStruct extends TailStruct<boolean> {
            x: number,
            y: number,
        }
        const tailStructType = new TailStructType<MyTailStruct>([
            { name: "x", type: new IntType(2) },
            { name: "y", type: new IntType(1) },
        ], boolType);
        
        it("reads a tail struct in storage", async () => {
            const storage = new MemoryStorage();
            storage.data = Buffer.from([99, 99, 99, 5, 0, 10, 0, 1, 0, 99]);
            const pointer = new StoragePointer(3, tailStructType);
            const tailStruct = await storage.readTailStruct(pointer, 3);
            expect(tailStruct).toEqual({ x: 5, y: 10, _tail: [false, true, false] });
        });
    });
    
    describe("markVersion", () => {
        it("changes the version number of storage", async () => {
            const storage = new MemoryStorage();
            expect(storage.getVersion()).toEqual(null);
            await storage.markVersion();
            expect(storage.getVersion()).toEqual(0);
            await storage.markVersion();
            expect(storage.getVersion()).toEqual(1);
        });
    });
});


