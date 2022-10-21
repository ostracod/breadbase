
import { Selector, Value, Index } from "./types.js";
import { DataType } from "./internalTypes.js";
import { spanDegreeAmount, AllocType } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { StoragePointer, createNullPointer, getArrayElementPointer, getStructFieldPointer } from "./storagePointer.js";
import { storageHeaderType, spanType, EmptySpan, emptySpanType, Alloc, allocType } from "./builtTypes.js";
import { Storage, FileStorage } from "./storage.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

const storageHeaderSize = storageHeaderType.getSize();
const storageHeaderPointer = new StoragePointer(0, storageHeaderType);
const nullSpanPointer = createNullPointer(spanType);
const nullEmptySpanPointer = createNullPointer(emptySpanType);
// Includes both the header and data region.
const minimumSpanSplitSize = Math.max(emptySpanType.getSize(), allocType.getSize() + 20);

export class BreadBase {
    storage: Storage;
    emptySpansByDegree: StoragePointer<EmptySpan>[];
    finalSpan: StoragePointer<EmptySpan>;
    
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
        this.emptySpansByDegree = [];
        while (this.emptySpansByDegree.length < spanDegreeAmount) {
            this.emptySpansByDegree.push(nullEmptySpanPointer);
        }
        this.finalSpan = new StoragePointer(storageHeaderSize, emptySpanType);
        await this.storage.setSize(storageHeaderSize + emptySpanType.getSize());
        await this.storage.write(
            storageHeaderPointer,
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
    
    async setEmptySpanByDegree(
        span: StoragePointer<EmptySpan>,
        degree: number,
    ): Promise<void> {
        this.emptySpansByDegree[degree] = span;
        await this.storage.write(
            getArrayElementPointer(
                getStructFieldPointer(storageHeaderPointer, "emptySpansByDegree"),
                degree,
            ),
            span,
        );
    }
    
    async setFinalSpan(span: StoragePointer<EmptySpan>): Promise<void> {
        this.finalSpan = span;
        await this.storage.write(
            getStructFieldPointer(storageHeaderPointer, "finalSpan"),
            this.finalSpan,
        );
    }
    
    async popEmptySpanByDegree(degree: number): Promise<StoragePointer<EmptySpan> | null> {
        const span = this.emptySpansByDegree[degree];
        if (span.isNull()) {
            return null;
        }
        const nextSpan = await this.storage.read(
            getStructFieldPointer(span, "nextByDegree"),
        );
        if (!nextSpan.isNull()) {
            await this.storage.write(
                getStructFieldPointer(nextSpan, "previousByDegree"),
                nullEmptySpanPointer,
            );
        }
        await this.setEmptySpanByDegree(nextSpan, degree);
        return span;
    }
    
    // This method returns the next span with the given
    // degree, and does not modify the `span` argument.
    async pushEmptySpanByDegree(
        span: StoragePointer<EmptySpan>,
        degree: number,
    ): Promise<StoragePointer<EmptySpan>> {
        const nextSpan = this.emptySpansByDegree[degree];
        if (!nextSpan.isNull()) {
            await this.storage.write(
                getStructFieldPointer(nextSpan, "previousByDegree"),
                span,
            );
        }
        await this.setEmptySpanByDegree(span, degree);
        return nextSpan;
    }
    
    async createAlloc(type: AllocType, size: number): Promise<StoragePointer<Alloc>> {
        const usedSizeWithHeader = allocType.getSize() + size;
        const usedSize = usedSizeWithHeader - spanType.getSize()
        let degree = allocUtils.convertSizeToDegree(usedSize - 1) + 1;
        let emptySpan: StoragePointer<EmptySpan> = null;
        while (degree < this.emptySpansByDegree.length) {
            const tempSpan = await this.popEmptySpanByDegree(degree);
            if (tempSpan !== null) {
                emptySpan = tempSpan;
                break;
            }
            degree += 1;
        }
        if (emptySpan === null) {
            emptySpan = this.finalSpan;
        }
        let spanSize = await this.storage.read(
            getStructFieldPointer(emptySpan, "spanSize"),
        );
        const unusedSize = (spanSize < 0) ? -1 : spanSize - usedSize;
        if (unusedSize < 0 || unusedSize >= minimumSpanSplitSize) {
            spanSize = usedSize;
            const splitSpan = new StoragePointer(
                emptySpan.index + usedSizeWithHeader,
                emptySpanType,
            );
            await this.storage.write(
                getStructFieldPointer(emptySpan, "spanSize"),
                spanSize,
            );
            await this.storage.write(
                getStructFieldPointer(emptySpan, "degree"),
                allocUtils.convertSizeToDegree(spanSize),
            );
            const nextSpan = await this.storage.read(
                getStructFieldPointer(emptySpan, "nextByNeighbor"),
            );
            await this.storage.write(
                getStructFieldPointer(emptySpan, "nextByNeighbor"),
                splitSpan,
            );
            const splitSize = (unusedSize < 0) ? -1 : unusedSize - spanType.getSize();
            const splitDegree = allocUtils.convertSizeToDegree(splitSize);
            let nextByDegree: StoragePointer<EmptySpan>;
            if (nextSpan.isNull()) {
                // In this case, we assume that (splitSize < 0).
                nextByDegree = nullEmptySpanPointer;
                await this.setFinalSpan(splitSpan);
                const endIndex = splitSpan.index + emptySpanType.getSize();
                if (this.storage.getSize() < endIndex) {
                    await this.storage.setSize(endIndex);
                }
            } else {
                nextByDegree = await this.pushEmptySpanByDegree(splitSpan, splitDegree);
                await this.storage.write(
                    getStructFieldPointer(nextSpan, "previousByNeighbor"),
                    splitSpan,
                );
            }
            await this.storage.write(
                splitSpan,
                {
                    previousByNeighbor: emptySpan,
                    nextByNeighbor: nextSpan,
                    spanSize: splitSize,
                    degree: splitDegree,
                    isEmpty: true,
                    previousByDegree: nullEmptySpanPointer,
                    nextByDegree,
                },
            );
        }
        const output = emptySpan.convert(allocType);
        await this.storage.write(
            getStructFieldPointer(output, "isEmpty"),
            false,
        );
        await this.storage.write(
            getStructFieldPointer(output, "type"),
            type,
        );
        await this.storage.write(
            getStructFieldPointer(output, "allocSize"),
            size,
        );
        return output;
    }
    
    async deleteAlloc(pointer: StoragePointer<Alloc>): Promise<void> {
        // TODO: Implement.
        
    }
}


