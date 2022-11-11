
import { TailStruct } from "./internalTypes.js";
import { DataType, TailStructType, getTailStructType } from "./dataType.js";
import { spanDegreeAmount, AllocType } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { StoragePointer, createNullPointer, getArrayElementPointer, getStructFieldPointer } from "./storagePointer.js";
import { storageHeaderType, spanType, EmptySpan, emptySpanType, Alloc, allocType } from "./builtTypes.js";
import { Storage } from "./storage.js";
import { StorageAccessor } from "./storageAccessor.js";

const storageHeaderSize = storageHeaderType.getSize();
const storageHeaderPointer = new StoragePointer(0, storageHeaderType);
const nullSpanPointer = createNullPointer(spanType);
const nullEmptySpanPointer = createNullPointer(emptySpanType);
// Includes both the header and data region.
const minimumSpanSplitSize = Math.max(emptySpanType.getSize(), allocType.getSize() + 20);

export class HeapAllocator extends StorageAccessor {
    emptySpansByDegree: StoragePointer<EmptySpan>[];
    finalSpan: StoragePointer<EmptySpan>;
    
    constructor(storage: Storage) {
        super();
        this.setStorage(storage);
    }
    
    async createEmptyHeap(): Promise<void> {
        this.emptySpansByDegree = [];
        while (this.emptySpansByDegree.length < spanDegreeAmount) {
            this.emptySpansByDegree.push(nullEmptySpanPointer);
        }
        this.finalSpan = new StoragePointer(storageHeaderSize, emptySpanType);
        await this.storage.setSize(storageHeaderSize + emptySpanType.getSize());
        await this.write(
            storageHeaderPointer,
            {
                emptySpansByDegree: this.emptySpansByDegree,
                finalSpan: this.finalSpan,
            },
        );
        await this.write(
            this.finalSpan,
            {
                previousByNeighbor: nullSpanPointer,
                nextByNeighbor: nullSpanPointer,
                spanSize: -1,
                degree: -1,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree: nullEmptySpanPointer,
            },
        );
    }
    
    async initWithHeap(): Promise<void> {
        const storageHeader = await this.read(
            new StoragePointer(0, storageHeaderType),
        );
        this.emptySpansByDegree = storageHeader.emptySpansByDegree;
        this.finalSpan = storageHeader.finalSpan;
    }
    
    async setEmptySpanByDegree(
        span: StoragePointer<EmptySpan>,
        degree: number,
    ): Promise<void> {
        this.emptySpansByDegree[degree] = span;
        await this.write(
            getArrayElementPointer(
                getStructFieldPointer(storageHeaderPointer, "emptySpansByDegree"),
                degree,
            ),
            span,
        );
    }
    
    async setFinalSpan(span: StoragePointer<EmptySpan>): Promise<void> {
        this.finalSpan = span;
        await this.writeStructField(storageHeaderPointer, "finalSpan", this.finalSpan);
    }
    
    async removeEmptySpanHelper(
        span: StoragePointer<EmptySpan>,
        degree: number,
    ): Promise<void> {
        const previousSpan = await this.readStructField(span, "previousByDegree");
        const nextSpan = await this.readStructField(span, "nextByDegree");
        if (previousSpan.isNull()) {
            await this.setEmptySpanByDegree(nextSpan, degree);
        } else {
            await this.writeStructField(previousSpan, "nextByDegree", nextSpan);
        }
        if (!nextSpan.isNull()) {
            await this.writeStructField(nextSpan, "previousByDegree", previousSpan);
        }
    }
    
    async removeEmptySpan(span: StoragePointer<EmptySpan>): Promise<void> {
        const degree = await this.readStructField(span, "degree");
        if (degree >= 0) {
            await this.removeEmptySpanHelper(span, degree);
        }
    }
    
    async popEmptySpan(degree: number): Promise<StoragePointer<EmptySpan> | null> {
        const span = this.emptySpansByDegree[degree];
        if (span.isNull()) {
            return null;
        }
        await this.removeEmptySpanHelper(span, degree);
        return span;
    }
    
    // This method returns the next span with the given
    // degree, and does not modify the `span` argument.
    async pushEmptySpan(
        span: StoragePointer<EmptySpan>,
        degree: number,
    ): Promise<StoragePointer<EmptySpan>> {
        const nextSpan = this.emptySpansByDegree[degree];
        if (!nextSpan.isNull()) {
            await this.writeStructField(nextSpan, "previousByDegree", span);
        }
        await this.setEmptySpanByDegree(span, degree);
        return nextSpan;
    }
    
    async createAlloc(type: AllocType, size: number): Promise<StoragePointer<Alloc>> {
        const usedSizeWithHeader = allocType.getSize() + size;
        const usedSize = usedSizeWithHeader - spanType.getSize();
        let degree = allocUtils.convertSizeToDegree(usedSize - 1) + 1;
        let emptySpan: StoragePointer<EmptySpan> = null;
        // TODO: Make this more efficient by storing a list of bitfields.
        while (degree < this.emptySpansByDegree.length) {
            const tempSpan = await this.popEmptySpan(degree);
            if (tempSpan !== null) {
                emptySpan = tempSpan;
                break;
            }
            degree += 1;
        }
        if (emptySpan === null) {
            emptySpan = this.finalSpan;
        }
        let spanSize = await this.readStructField(emptySpan, "spanSize");
        const unusedSize = (spanSize < 0) ? -1 : spanSize - usedSize;
        if (unusedSize < 0 || unusedSize >= minimumSpanSplitSize) {
            spanSize = usedSize;
            const splitSpan = new StoragePointer(
                emptySpan.index + usedSizeWithHeader,
                emptySpanType,
            );
            await this.writeStructFields(emptySpan, {
                spanSize,
                degree: allocUtils.convertSizeToDegree(spanSize),
            });
            const nextSpan = await this.readStructField(emptySpan, "nextByNeighbor");
            await this.writeStructField(emptySpan, "nextByNeighbor", splitSpan);
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
                nextByDegree = await this.pushEmptySpan(splitSpan, splitDegree);
                await this.writeStructField(nextSpan, "previousByNeighbor", splitSpan);
            }
            await this.write(
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
        await this.writeStructFields(output, {
            isEmpty: false,
            type,
            allocSize: size,
        });
        return output;
    }
    
    async deleteAlloc(alloc: StoragePointer<Alloc>): Promise<void> {
        let previousSpan = await this.readStructField(alloc, "previousByNeighbor");
        const nextSpan = await this.readStructField(alloc, "nextByNeighbor");
        let linkSpan1 = alloc.convert(emptySpanType);
        let linkSpan2 = nextSpan;
        if (!previousSpan.isNull()) {
            const isEmpty = await this.readStructField(previousSpan, "isEmpty");
            if (isEmpty) {
                linkSpan1 = previousSpan.convert(emptySpanType);
                await this.removeEmptySpan(linkSpan1);
                previousSpan = await this.readStructField(linkSpan1, "previousByNeighbor");
            }
        }
        if (!nextSpan.isNull()) {
            const isEmpty = await this.readStructField(nextSpan, "isEmpty");
            if (isEmpty) {
                linkSpan2 = await this.readStructField(nextSpan, "nextByNeighbor");
                await this.removeEmptySpan(nextSpan.convert(emptySpanType));
            }
        }
        let spanSize: number;
        let degree: number;
        let nextByDegree: StoragePointer<EmptySpan>;
        if (linkSpan2.isNull()) {
            spanSize = -1;
            degree = -1;
            nextByDegree = nullEmptySpanPointer;
            await this.setFinalSpan(linkSpan1);
        } else {
            spanSize = linkSpan2.index - (linkSpan1.index + spanType.getSize());
            degree = allocUtils.convertSizeToDegree(spanSize);
            nextByDegree = await this.pushEmptySpan(linkSpan1, degree);
            await this.writeStructField(linkSpan2, "previousByNeighbor", linkSpan1);
        }
        await this.write(
            linkSpan1,
            {
                previousByNeighbor: previousSpan,
                nextByNeighbor: linkSpan2,
                spanSize,
                degree,
                isEmpty: true,
                previousByDegree: nullEmptySpanPointer,
                nextByDegree,
            },
        );
    }
    
    async createSuperAlloc<T extends Alloc>(
        typeNumber: AllocType,
        structType: DataType<T>,
    ): Promise<StoragePointer<T>> {
        return (await this.createAlloc(
            typeNumber,
            structType.getSize() - allocType.getSize(),
        )).convert(structType);
    }
    
    async createSuperTailAlloc<T extends Alloc & TailStruct>(
        typeNumber: AllocType,
        tailStructType: TailStructType<T>,
        tailLength: number,
    ): Promise<StoragePointer<T>> {
        return (await this.createAlloc(
            typeNumber,
            tailStructType.getSizeWithTail(tailLength) - allocType.getSize(),
        )).convert(tailStructType);
    }
    
    async getSuperTailLength<T extends Alloc & TailStruct>(
        tailStructAlloc: StoragePointer<T>,
    ): Promise<number> {
        const allocSize = await this.readStructField(tailStructAlloc, "allocSize");
        const tailStructType = getTailStructType(tailStructAlloc.type);
        return tailStructType.getTailLength(allocType.getSize() + allocSize);
    }
}


