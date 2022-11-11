
import { MemoryStorage } from "../src/storage.js";
import { HeapAllocator } from "../src/heapAllocator.js";
import { ValueManager } from "../src/valueManager.js";

const createValueManager = async (): Promise<ValueManager> => {
    const allocator = new HeapAllocator(new MemoryStorage());
    await allocator.createEmptyHeap();
    return new ValueManager(allocator);
};

describe("ValueManager", () => {
    describe("allocateValue", () => {
        it("creates a boolean value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue(true);
            const value = await manager.readValue(valueSlot);
            expect(value).toEqual(true);
        });
        
        it("creates a number value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue(123);
            const value = await manager.readValue(valueSlot);
            expect(value).toEqual(123);
        });
        
        it("creates a null value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue(null);
            const value = await manager.readValue(valueSlot);
            expect(value).toEqual(null);
        });
        
        it("creates a buffer value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue(Buffer.from([10, 20, 30]));
            const value = await manager.readValue(valueSlot);
            expect(Buffer.isBuffer(value)).toEqual(true);
            expect(Array.from(value)).toEqual([10, 20, 30]);
        });
        
        it("creates a string value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue("Hello!");
            const value = await manager.readValue(valueSlot);
            expect(value).toEqual("Hello!");
        });
        
        it("creates a list value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue([123, null, "Very cool"]);
            const value = await manager.readValue(valueSlot);
            expect(value).toEqual([123, null, "Very cool"]);
        });
        
        it("creates a dict value", async () => {
            const manager = await createValueManager();
            const valueSlot = await manager.allocateValue({ name: "Bob", age: 65 });
            const value = await manager.readValue(valueSlot);
            expect(value).toEqual({ name: "Bob", age: 65 });
        });
    });
});


