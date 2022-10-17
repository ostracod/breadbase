
import { Selector, Value, Index, Storage } from "./types.js";
import { spanDegreeAmount } from "./constants.js";
import { DataType } from "./dataType.js";
import { StorageHeader, storageHeaderType } from "./structs.js";
import { FileStorage } from "./storage.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase {
    storage: Storage;
    emptySpans: number[];
    
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
    
    async readByType<T>(offset: number, type: DataType<T>): Promise<T> {
        const data = await this.storage.read(type.getSize(), offset);
        return type.read(data, 0);
    }
    
    async writeByType<T>(offset: number, type: DataType<T>, value: T): Promise<void> {
        const data = Buffer.alloc(type.getSize());
        type.write(data, 0, value);
        await this.storage.write(offset, data);
    }
    
    async createEmptyDb(): Promise<void> {
        this.emptySpans = [];
        while (this.emptySpans.length < spanDegreeAmount) {
            this.emptySpans.push(0);
        }
        // TODO: Create the first empty span.
        
        const storageHeader: StorageHeader = {
            emptySpans: this.emptySpans,
        }
        await this.storage.setSize(storageHeaderType.getSize());
        await this.writeByType(0, storageHeaderType, storageHeader);
        await this.storage.markVersion();
    }
    
    async initWithStorage(storage: Storage): Promise<void> {
        this.storage = storage;
        if (this.storage.getVersion() === null) {
            await this.createEmptyDb();
        } else {
            const storageHeader = await this.readByType(0, storageHeaderType);
            this.emptySpans = storageHeader.emptySpans;
        }
    }
}


