
import { Selector, Value, Index } from "./types.js";
import { StoragePointer, Storage } from "./internalTypes.js";
import { spanDegreeAmount, nullPointer } from "./constants.js";
import { DataType } from "./dataType.js";
import { storageHeaderType, SpanHeader, spanHeaderType, emptySpanHeaderType } from "./structs.js";
import { FileStorage } from "./storage.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase {
    storage: Storage;
    emptySpansByDegree: StoragePointer<SpanHeader>[];
    finalSpan: StoragePointer<SpanHeader>;
    
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
    
    async readByType<T>(pointer: StoragePointer<T>, type: DataType<T>): Promise<T> {
        const data = await this.storage.read(type.getSize(), pointer);
        return type.read(data, 0);
    }
    
    async writeByType<T>(
        pointer: StoragePointer<T>,
        type: DataType<T>,
        value: T,
    ): Promise<void> {
        const data = Buffer.alloc(type.getSize());
        type.write(data, 0, value);
        await this.storage.write(pointer, data);
    }
    
    async createEmptyDb(): Promise<void> {
        const headerSize1 = storageHeaderType.getSize();
        const headerSize2 = spanHeaderType.getSize();
        const headerSize3 = emptySpanHeaderType.getSize();
        this.emptySpansByDegree = [];
        while (this.emptySpansByDegree.length < spanDegreeAmount) {
            this.emptySpansByDegree.push(0);
        }
        this.finalSpan = headerSize1;
        await this.storage.setSize(headerSize1 + headerSize2 + headerSize3);
        await this.writeByType(0, storageHeaderType, {
            emptySpansByDegree: this.emptySpansByDegree,
            finalSpan: this.finalSpan,
        });
        await this.writeByType(headerSize1, spanHeaderType, {
            previousByNeighbor: nullPointer,
            nextByNeighbor: nullPointer,
            size: -1,
            degree: -1,
            isEmpty: 1,
        });
        await this.writeByType(headerSize1 + headerSize2, emptySpanHeaderType, {
            previousByDegree: nullPointer,
            nextByDegree: nullPointer,
        });
        await this.storage.markVersion();
    }
    
    async initWithStorage(storage: Storage): Promise<void> {
        this.storage = storage;
        if (this.storage.getVersion() === null) {
            await this.createEmptyDb();
        } else {
            const storageHeader = await this.readByType(0, storageHeaderType);
            this.emptySpansByDegree = storageHeader.emptySpansByDegree;
            this.finalSpan = storageHeader.finalSpan;
        }
    }
}


