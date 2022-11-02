
import { Path, Value, Index } from "./types.js";
import { Storage, FileStorage } from "./storage.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { TreeManager } from "./treeManager.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase extends StorageAccessor {
    heapAllocator: HeapAllocator;
    treeManager: TreeManager;
    
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
        this.treeManager = new TreeManager(this.storage, this.heapAllocator);
    }
}


