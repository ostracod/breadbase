
import { TailStruct } from "./internalTypes.js";
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
    tailStructType: TailStructType<TailStruct<T>>;
    fieldValues: Partial<TreeContent>;
    items: T[];
    
    async init(manager: TreeManager, content: StoragePointer<TreeContent<T>>): Promise<void> {
        this.heapAllocator = this.manager.heapAllocator;
        this.manager = manager;
        this.setStorage(this.manager.storage);
        this.fieldValues = {};
        const allocType = await this.getField("type");
        const tailStructType = contentTypeMap.get(allocType) as TailStructType<TreeContent<T>>;
        this.content = content.convert(tailStructType);
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
    
    getElementSize(): number {
        return this.tailStructType.elementType.getSize();
    }
    
    async getItem(index: number): Promise<T> {
        let item = this.items[index];
        if (typeof item === "undefined") {
            item = await this.readTailElement(this.content, index);
            this.items[index] = item;
        }
        return item;
    }
    
    async getAllItems(): Promise<T[]> {
        const output: T[] = [];
        const itemCount = await this.getField("itemCount");
        for (let index = 0; index < itemCount; index += 1) {
            const item = await this.getItem(index);
            output.push(item);
        }
        return output;
    }
    
    async resizeBuffer(length: number): Promise<void> {
        const parent = await this.getField("parent");
        const allocType = await this.getField("type");
        const items = await this.getAllItems();
        const content = await this.manager.createTreeContent(
            parent,
            allocType,
            length,
            items,
        );
        await this.writeStructField(parent, "treeContent", content);
        await this.heapAllocator.deleteAlloc(this.content);
        this.content = content;
        this.fieldValues.bufferLength = length;
    }
}


