
import { Selector, Value, Index } from "./types.js";
import { DataType } from "./internalTypes.js";
import { spanDegreeAmount } from "./constants.js";
import { StoragePointer, NullPointer } from "./storagePointer.js";
import { storageHeaderType, spanHeaderType, EmptySpanHeader, emptySpanHeaderType } from "./builtTypes.js";
import { Storage, FileStorage } from "./storage.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase {
    storage: Storage;
    emptySpansByDegree: StoragePointer<EmptySpanHeader>[];
    finalSpan: StoragePointer<EmptySpanHeader>;
    
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
    
    async createEmptyDb(): Promise<void> {
        const storageHeaderSize = storageHeaderType.getSize();
        const nullSpanPointer = new NullPointer(spanHeaderType);
        const nullEmptySpanPointer = new NullPointer(emptySpanHeaderType);
        this.emptySpansByDegree = [];
        while (this.emptySpansByDegree.length < spanDegreeAmount) {
            this.emptySpansByDegree.push(nullEmptySpanPointer);
        }
        this.finalSpan = new StoragePointer(storageHeaderSize, emptySpanHeaderType);
        await this.storage.setSize(storageHeaderSize + emptySpanHeaderType.getSize());
        await this.storage.write(
            new StoragePointer(0, storageHeaderType),
            {
                emptySpansByDegree: this.emptySpansByDegree,
                finalSpan: this.finalSpan,
            },
        );
        await this.storage.write(
            this.finalSpan,
            {
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: nullSpanPointer,
                spanSize: -1,
                degree: -1,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            }
        );
        await this.storage.markVersion();
    }
    
    async initWithStorage(storage: Storage): Promise<void> {
        this.storage = storage;
        if (this.storage.getVersion() === null) {
            await this.createEmptyDb();
        } else {
            const storageHeader = await this.storage.read(
                new StoragePointer(0, storageHeaderType),
            );
            this.emptySpansByDegree = storageHeader.emptySpansByDegree;
            this.finalSpan = storageHeader.finalSpan;
        }
    }
}


