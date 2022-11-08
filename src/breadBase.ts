
import { Path, Value, Index } from "./types.js";
import { ValueSlot, ContentRoot, DictEntry } from "./builtTypes.js";
import { ValueSlotType } from "./constants.js";
import { Storage, FileStorage } from "./storage.js";
import { StoragePointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase extends StorageAccessor {
    heapAllocator: HeapAllocator;
    
    public async init(directoryPath: string): Promise<void> {
        const storage = new FileStorage();
        await storage.init(directoryPath);
        await this.initWithStorage(storage);
    }
    
    public async load(path: Path): Promise<Value | Value[]> {
        throw new Error("Not yet implemented.");
    }
    
    public async set(path: Path, value: Value): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async appendElem(path: Path, value: Value): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async appendElems(path: Path, values: Value[]): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async delete(path: Path): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async addIndex(path: Path, index: Index): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async removeIndex(path: Path, index: Index): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async getIndexes(path: Path): Promise<Index[]> {
        throw new Error("Not yet implemented.");
    }
    
    async createEmptyDb(): Promise<void> {
        await this.heapAllocator.createEmptyHeap();
        await this.storage.markVersion();
    }
    
    async initWithDb(): Promise<void> {
        await this.heapAllocator.initWithHeap();
    }
    
    async initWithStorage(storage: Storage): Promise<void> {
        this.setStorage(storage);
        this.heapAllocator = new HeapAllocator(this.storage);
        if (this.storage.getVersion() === null) {
            await this.createEmptyDb();
        } else {
            await this.initWithDb();
        }
    }
    
    async allocateBuffer(buffer: Buffer): Promise<StoragePointer<ContentRoot<number>>> {
        // TODO: Implement.
        return null;
    }
    
    async allocateString(text: string): Promise<StoragePointer<ContentRoot<number>>> {
        // TODO: Implement.
        return null;
    }
    
    async allocateList(list: Value[]): Promise<StoragePointer<ContentRoot<ValueSlot>>> {
        // TODO: Implement.
        return null;
    }
    
    async allocateDict(text: string): Promise<StoragePointer<ContentRoot<DictEntry>>> {
        // TODO: Implement.
        return null;
    }
    
    async allocateValue(value: Value): Promise<ValueSlot> {
        let valueSlotType: ValueSlotType;
        const data = Buffer.alloc(8);
        const typeText = (typeof value);
        if (typeText === "boolean") {
            valueSlotType = ValueSlotType.Boolean;
            data.writeInt8(value ? 1 : 0);
        } else if (typeText === "number") {
            valueSlotType = ValueSlotType.Number;
            data.writeDoubleLE(value);
        } else if (value === null) {
            valueSlotType = ValueSlotType.Null;
        } else {
            valueSlotType = ValueSlotType.TreeRoot;
            let root: StoragePointer<ContentRoot>;
            if (typeText === "string") {
                root = await this.allocateString(value);
            } else if (typeText === "object") {
                if (Buffer.isBuffer(value)) {
                    root = await this.allocateBuffer(value);
                } else if (Array.isArray(value)) {
                    root = await this.allocateList(value);
                } else {
                    root = await this.allocateDict(value);
                }
            } else {
                throw new Error(`Cannot allocate the value ${value}.`);
            }
            root.getPointerType().write(data, 0, root);
        }
        return { type: valueSlotType, data };
    }
}


