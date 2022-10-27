
import { TailStruct } from "../src/internalTypes.js";
import { boolType, IntType, TailStructType } from "../src/dataType.js"
import { StoragePointer } from "../src/storagePointer.js";
import { MemoryStorage } from "../src/storage.js"
import { StorageAccessor } from "../src/storageAccessor.js"

describe("StorageAccessor", () => {
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
            const storageAccessor = new StorageAccessor();
            storageAccessor.setStorage(storage);
            const pointer = new StoragePointer(3, tailStructType);
            const tailStruct = await storageAccessor.readTailStruct(pointer, 3);
            expect(tailStruct).toEqual({ x: 5, y: 10, _tail: [false, true, false] });
        });
    });
});


