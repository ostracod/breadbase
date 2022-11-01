
import { defaultContentSize, TreeDirection } from "./constants.js";
import { TailStructType } from "./dataType.js";
import { TreeContent, stringAsciiCharsType } from "./builtTypes.js";
import { AllocType } from "./constants.js";
import { StoragePointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { TreeManager } from "./treeManager.js";

export const contentTypeMap: Map<AllocType, TailStructType<TreeContent>> = new Map([
    [AllocType.StringAsciiChars, stringAsciiCharsType],
]);

export class ContentAccessor<T = any> extends StorageAccessor {
    heapAllocator: HeapAllocator;
    manager: TreeManager;
    content: StoragePointer<TreeContent<T>>;
    tailStructType: TailStructType<TreeContent<T>>;
    fieldValues: Partial<TreeContent>;
    items: T[];
    
    async init(manager: TreeManager, content: StoragePointer<TreeContent<T>>): Promise<void> {
        this.manager = manager;
        this.heapAllocator = this.manager.heapAllocator;
        this.setStorage(this.manager.storage);
        this.content = content;
        this.fieldValues = {};
        this.items = [];
        const allocType = await this.getField("type");
        this.tailStructType = contentTypeMap.get(allocType) as TailStructType<TreeContent<T>>;
        this.content = this.content.convert(this.tailStructType);
    }
    
    async getField<T2 extends string & (keyof TreeContent)>(
        name: T2,
    ): Promise<TreeContent[T2]> {
        let value = this.fieldValues[name];
        if (typeof value === "undefined") {
            value = await this.readStructField(this.content, name);
            this.fieldValues[name] = value;
        }
        return value as TreeContent[T2];
    }
    
    async setField<T2 extends string & (keyof TreeContent)>(
        name: T2,
        value: TreeContent[T2],
    ): Promise<void> {
        await this.writeStructField(this.content, name, value);
        this.fieldValues[name] = value;
    }
    
    getElementSize(): number {
        return this.tailStructType.elementType.getSize();
    }
    
    getDefaultBufferLength(): number {
        return Math.ceil(defaultContentSize / this.getElementSize());
    }
    
    getMaximumMoveLength(): number {
        return this.getDefaultBufferLength() * 2;
    }
    
    async getItem(index: number): Promise<T> {
        let item = this.items[index];
        if (typeof item === "undefined") {
            item = await this.readTailElement(this.content, index);
            this.items[index] = item;
        }
        return item;
    }
    
    async setItem(index: number, value: T): Promise<void> {
        await this.writeTailElement(this.content, index, value);
        this.items[index] = value;
    }
    
    async getItems(startIndex: number, endIndex: number): Promise<T[]> {
        const output: T[] = [];
        for (let index = startIndex; index < endIndex; index += 1) {
            const item = await this.getItem(index);
            output.push(item);
        }
        return output;
    }
    
    async setItems(index: number, values: T[]): Promise<void> {
        for (let offset = 0; offset < values.length; offset += 1) {
            await this.setItem(index + offset, values[offset]);
        }
    }
    
    async getAllItems(): Promise<T[]> {
        const itemCount = await this.getField("itemCount");
        return this.getItems(0, itemCount);
    }
    
    async getAndInsertItems(index: number, valuesToInsert: T[]): Promise<T[]> {
        const itemCount = await this.getField("itemCount");
        const previousValues = await this.getItems(0, index);
        const nextValues = await this.getItems(index, itemCount);
        return previousValues.concat(valuesToInsert, nextValues);
    }
    
    async getAndDeleteItems(startIndex: number, endIndex: number): Promise<T[]> {
        const itemCount = await this.getField("itemCount");
        const previousValues = await this.getItems(0, startIndex);
        const nextValues = await this.getItems(endIndex, itemCount);
        return previousValues.concat(nextValues);
    }
    
    async insertItems(index: number, valuesToInsert: T[]): Promise<void> {
        const itemCount = await this.getField("itemCount");
        await this.setField("itemCount", itemCount + valuesToInsert.length);
        const valuesToMove = await this.getItems(index, itemCount);
        await this.setItems(index + valuesToInsert.length, valuesToMove);
        await this.setItems(index, valuesToInsert);
    }
    
    async deleteItems(startIndex: number, endIndex: number): Promise<void> {
        const lengthToDelete = endIndex - startIndex;
        const itemCount = await this.getField("itemCount");
        const valuesToMove = await this.getItems(endIndex, itemCount);
        await this.setItems(startIndex, valuesToMove);
        await this.setField("itemCount", itemCount - lengthToDelete);
    }
    
    async isFinalNode(): Promise<boolean> {
        const parent = await this.getField("parent");
        return this.manager.isFinalTreeNode(parent);
    }
    
    async resizeBuffer(length: number, inputValues?: T[]): Promise<void> {
        const parent = await this.getField("parent");
        let values: T[] = [];
        if (typeof inputValues === "undefined") {
            values = await this.getAllItems();
        } else {
            values = inputValues;
        }
        const content = await this.manager.createTreeContent(
            parent,
            await this.getField("type"),
            length,
            values,
        );
        await this.writeStructField(parent, "treeContent", content);
        await this.heapAllocator.deleteAlloc(this.content);
        this.content = content;
        this.fieldValues.bufferLength = length;
    }
    
    async shatter(inputValues?: T[]): Promise<void> {
        const parent = await this.getField("parent");
        const allocType = await this.getField("type");
        let values: T[] = [];
        if (typeof inputValues === "undefined") {
            values = await this.getAllItems();
        } else {
            values = inputValues;
        }
        const defaultLength = this.getDefaultBufferLength();
        for (let startIndex = 0; startIndex < values.length; startIndex += defaultLength) {
            const endIndex = Math.min(startIndex + defaultLength, values.length);
            const subValues = values.slice(startIndex, endIndex);
            const node = await this.manager.createTreeNode(
                allocType,
                defaultLength,
                subValues,
            );
            await this.manager.insertTreeNode(node, parent, TreeDirection.Forward);
        }
        await this.manager.deleteTreeNode(parent);
    }
    
    async insertItemsWithOverflow(index: number, valuesToInsert: T[]): Promise<void> {
        const bufferLength = await this.getField("bufferLength");
        let targetCount: number;
        if (await this.isFinalNode()) {
            targetCount = bufferLength;
        } else {
            targetCount = Math.ceil(bufferLength / 2);
        }
        let itemCount = await this.getField("itemCount");
        const valuesToAppend = valuesToInsert.concat(await this.getItems(index, itemCount));
        await this.deleteItems(index, itemCount);
        let nextNodeItems: T[];
        itemCount = await this.getField("itemCount");
        if (targetCount < itemCount) {
            const previousValues = await this.getItems(targetCount, itemCount);
            await this.deleteItems(targetCount, itemCount);
            nextNodeItems = previousValues.concat(valuesToAppend);
        } else if (targetCount > itemCount) {
            const splitLength = targetCount - itemCount;
            const splitValues = valuesToAppend.slice(0, splitLength);
            await this.insertItems(itemCount, splitValues);
            nextNodeItems = valuesToAppend.slice(splitLength, valuesToAppend.length);
        } else {
            nextNodeItems = valuesToAppend;
        }
        const node = await this.manager.createTreeNode(
            await this.getField("type"),
            Math.max(nextNodeItems.length, this.getDefaultBufferLength()),
            nextNodeItems,
        );
        const parent = await this.getField("parent");
        await this.manager.insertTreeNode(node, parent, TreeDirection.Backward);
    }
    
    async borrowItems(): Promise<void> {
        const parent = await this.getField("parent");
        const nextParent = await this.manager.getNextTreeNode(parent);
        if (nextParent === null) {
            return;
        }
        const bufferLength = await this.getField("bufferLength");
        const itemCount = await this.getField("itemCount");
        const targetCount = Math.ceil(bufferLength / 2);
        const borrowCount = targetCount - itemCount;
        const nextAccessor = await this.manager.createNodeContentAccessor(nextParent);
        const nextItemCount = await nextAccessor.getField("itemCount");
        if (borrowCount >= nextItemCount) {
            const valuesToBorrow = await nextAccessor.getAllItems();
            await this.manager.deleteTreeNode(nextParent);
            await this.insertItems(itemCount, valuesToBorrow);
            return;
        }
        const nextBufferLength = await nextAccessor.getField("bufferLength");
        const nextTargetCount = Math.ceil(nextBufferLength / 2);
        const countAfterDeletion = nextItemCount - borrowCount;
        if (countAfterDeletion < nextTargetCount) {
            return;
        }
        const valuesToBorrow = await nextAccessor.getItems(0, borrowCount);
        if (countAfterDeletion > nextAccessor.getMaximumMoveLength()) {
            const remainingValues = await nextAccessor.getItems(borrowCount, nextItemCount);
            await nextAccessor.shatter(remainingValues);
        } else {
            await nextAccessor.deleteItems(0, borrowCount);
        }
        await this.insertItems(itemCount, valuesToBorrow);
    }
}


