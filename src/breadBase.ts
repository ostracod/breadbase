
import { Selector, Value, Index, Storage } from "./types.js";
import { FileStorage } from "./storage.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase {
    storage: Storage;
    
    public async init(directoryPath: string): Promise<void> {
        const storage = new FileStorage();
        await storage.init(directoryPath);
        await this.initWithStorage(storage);
    }
    
    public async load(path: Selector[]): Promise<Value | Value[]> {
        throw new Error("Not yet implemented.");
    }
    
    public async set(path: Selector[], value: Value): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async append(path: Selector[], value: Value): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async extend(path: Selector[], values: Value[]): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async delete(path: Selector[]): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async addIndex(path: Selector[], index: Index): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async removeIndex(path: Selector[], index: Index): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    public async getIndexes(path: Selector[]): Promise<Index[]> {
        throw new Error("Not yet implemented.");
    }
    
    async initWithStorage(storage: Storage): Promise<void> {
        this.storage = storage;
        // TODO: Finish implementation.
        
    }
}


