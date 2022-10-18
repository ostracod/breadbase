
import { Selector, Value, Index } from "./types.js";
import { spanDegreeAmount } from "./constants.js";
import { DataType } from "./dataType.js";
import { StoragePointer, NullPointer } from "./storagePointer.js";
import { storageHeaderType, SpanHeader, spanHeaderType, emptySpanHeaderType } from "./structs.js";
import { Storage, FileStorage } from "./storage.js";

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
    
    async createEmptyDb(): Promise<void> {
        const headerSize1 = storageHeaderType.getSize();
        const headerSize2 = spanHeaderType.getSize();
        const headerSize3 = emptySpanHeaderType.getSize();
        const nullSpanPointer = new NullPointer(spanHeaderType);
        this.emptySpansByDegree = [];
        while (this.emptySpansByDegree.length < spanDegreeAmount) {
            this.emptySpansByDegree.push(nullSpanPointer);
        }
        this.finalSpan = new StoragePointer(headerSize1, spanHeaderType);
        await this.storage.setSize(headerSize1 + headerSize2 + headerSize3);
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
                size: -1,
                degree: -1,
                isEmpty: true,
            }
        );
        await this.storage.write(
            new StoragePointer(headerSize1 + headerSize2, emptySpanHeaderType),
            {
                previousByDegree: nullSpanPointer,
                nextByDegree: nullSpanPointer,
            },
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


