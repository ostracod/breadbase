
import { Path, Value, Index } from "./types.js";
import { ValueSlot, ContentRoot, contentRootType, ListRoot, listRootType, indexRootType, ContentNode, DictEntry, dictEntryType } from "./builtTypes.js";
import { AllocType, ValueSlotType } from "./constants.js";
import { Storage, FileStorage } from "./storage.js";
import { StoragePointer, createNullPointer, getTailPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { ContentTreeManager } from "./contentTreeManager.js";

// Methods and member variables which are not marked as public are meant
// to be used internally or in automated tests.

export class BreadBase extends StorageAccessor {
    heapAllocator: HeapAllocator;
    
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
    }
    
    async allocateContentRootHelper<T>(
        root: StoragePointer<ContentRoot<T>>,
        contentAllocType,
        values: T[],
    ): Promise<void> {
        const manager = new ContentTreeManager<T>(this.heapAllocator, root);
        const node = await manager.createNode(contentAllocType, values.length, values);
        await manager.setRootChild(node);
    }
    
    async allocateContentRoot<T>(
        rootAllocType,
        contentAllocType,
        values: T[],
    ): Promise<StoragePointer<ContentRoot<T>>> {
        const root = await this.heapAllocator.createSuperAlloc(
            rootAllocType,
            contentRootType,
        );
        await this.allocateContentRootHelper(root, contentAllocType, values);
        return root;
    }
    
    async allocateBuffer(buffer: Buffer): Promise<StoragePointer<ContentRoot<number>>> {
        return await this.allocateContentRoot(
            AllocType.BufferRoot,
            AllocType.BufferContent,
            Array.from(buffer),
        );
    }
    
    async allocateString(text: string): Promise<StoragePointer<ContentRoot<number>>> {
        // TODO: Support UTF-16 strings.
        return await this.allocateContentRoot(
            AllocType.AsciiStringRoot,
            AllocType.AsciiStringContent,
            Array.from(Buffer.from(text, "ascii")),
        );
    }
    
    async allocateList(values: Value[]): Promise<StoragePointer<ListRoot<ContentNode<ValueSlot>>>> {
        const valueSlots: ValueSlot[] = [];
        for (const value of values) {
            valueSlots.push(await this.allocateValue(value));
        }
        const root = await this.heapAllocator.createSuperAlloc(
            AllocType.ListRoot,
            listRootType,
        ) as StoragePointer<ListRoot<ContentNode<ValueSlot>>>;
        await this.writeStructField(
            root,
            "firstIndex",
            createNullPointer(indexRootType),
        );
        await this.allocateContentRootHelper(root, AllocType.ListContent, values);
        return root;
    }
    
    async allocateDict(
        dict: { [key: string]: Value },
    ): Promise<StoragePointer<ContentRoot<StoragePointer<DictEntry>>>> {
        const entries: StoragePointer<DictEntry>[] = [];
        for (const key in dict) {
            const valueSlot = await this.allocateValue(dict[key]);
            // TODO: Support UTF-16 keys.
            const entry = await this.heapAllocator.createSuperTailAlloc(
                AllocType.AsciiDictEntry,
                dictEntryType,
                key.length,
            );
            await this.writeStructField(entry, "value", valueSlot);
            const tailPointer = getTailPointer(entry, key.length);
            await this.write(tailPointer, Array.from(Buffer.from(key)));
            entries.push(entry);
        }
        return await this.allocateContentRoot(
            AllocType.DictRoot,
            AllocType.DictContent,
            entries,
        );
    }
    
    async allocateValue(value: Value): Promise<ValueSlot> {
        let valueSlotType: ValueSlotType;
        const data = Buffer.alloc(8);
        const typeText = (typeof value);
        if (typeText === "boolean") {
            valueSlotType = ValueSlotType.Boolean;
            data.writeInt8(value ? 1 : 0);
        } else if (typeText === "number") {
            valueSlotType = ValueSlotType.Number;
            data.writeDoubleLE(value);
        } else if (value === null) {
            valueSlotType = ValueSlotType.Null;
        } else {
            valueSlotType = ValueSlotType.TreeRoot;
            let root: StoragePointer<ContentRoot>;
            if (typeText === "string") {
                root = await this.allocateString(value);
            } else if (typeText === "object") {
                if (Buffer.isBuffer(value)) {
                    root = await this.allocateBuffer(value);
                } else if (Array.isArray(value)) {
                    root = await this.allocateList(value);
                } else {
                    root = await this.allocateDict(value);
                }
            } else {
                throw new Error(`Cannot allocate the value ${value}.`);
            }
            root.getPointerType().write(data, 0, root);
        }
        return { type: valueSlotType, data };
    }
}


