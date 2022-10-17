
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
    
    describe("write", () => {
        it("changes values in storage", async () => {
            const storage = new MemoryStorage();
            await storage.setSize(20);
            await storage.write(10, Buffer.from([11, 22]));
            await storage.write(15, Buffer.from([33, 44]));
            expect((await storage.read(10, 2)).compare(Buffer.from([11, 22]))).toEqual(0);
            expect((await storage.read(15, 2)).compare(Buffer.from([33, 44]))).toEqual(0);
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


