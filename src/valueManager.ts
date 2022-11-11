
import { Value } from "./types.js";
import { ContentTreeTypes } from "./internalTypes.js";
import { ValueSlot, TreeRoot, treeRootType, ContentRoot, BufferRoot, bufferRootType, AsciiStringRoot, asciiStringRootType, DictRoot, dictRootType, ListRoot, listRootType, ContentListRoot, contentListRootType, indexRootType, DictEntry, asciiDictEntryType } from "./builtTypes.js";
import { StoragePointerType, getTailStructType } from "./dataType.js";
import { bufferTreeTypes, asciiStringTreeTypes, dictTreeTypes, contentListTreeTypes } from "./contentTreeTypes.js";
import { AllocType, ValueSlotType } from "./constants.js";
import { StoragePointer, createNullPointer, getTailPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { ContentTreeManager } from "./contentTreeManager.js";

export class ValueManager extends StorageAccessor {
    heapAllocator: HeapAllocator;
    
    constructor(heapAllocator: HeapAllocator) {
        super();
        this.heapAllocator = heapAllocator;
        this.setStorage(this.heapAllocator.storage);
    }
    
    async allocateContentRootHelper<T>(
        root: StoragePointer<ContentRoot<T>>,
        contentTreeTypes: ContentTreeTypes<T>,
        values: T[],
    ): Promise<void> {
        const manager = new ContentTreeManager<T>(
            this.heapAllocator,
            contentTreeTypes,
            root,
        );
        const node = await manager.createNode(
            values.length,
            values,
        );
        await manager.setRootChild(node);
    }
    
    async allocateContentRoot<T>(
        contentTreeTypes: ContentTreeTypes<T>,
        values: T[],
    ): Promise<StoragePointer<ContentRoot<T>>> {
        const root = await this.heapAllocator.createSuperAlloc(
            contentTreeTypes.rootAllocType,
            contentTreeTypes.rootDataType,
        );
        await this.allocateContentRootHelper(root, contentTreeTypes, values);
        return root;
    }
    
    async allocateBuffer(buffer: Buffer): Promise<StoragePointer<BufferRoot>> {
        return await this.allocateContentRoot(bufferTreeTypes, Array.from(buffer));
    }
    
    async allocateString(text: string): Promise<StoragePointer<AsciiStringRoot>> {
        // TODO: Support UTF-16 strings.
        return await this.allocateContentRoot(
            asciiStringTreeTypes,
            Array.from(Buffer.from(text, "ascii")),
        );
    }
    
    async allocateList(values: Value[]): Promise<StoragePointer<ContentListRoot>> {
        const valueSlots: ValueSlot[] = [];
        for (const value of values) {
            valueSlots.push(await this.allocateValue(value));
        }
        const root = await this.heapAllocator.createSuperAlloc(
            AllocType.ListRoot,
            contentListRootType,
        );
        await this.writeStructField(
            root,
            "firstIndex",
            createNullPointer(indexRootType),
        );
        await this.allocateContentRootHelper(
            root,
            contentListTreeTypes,
            valueSlots,
        );
        return root;
    }
    
    async allocateDict(dict: { [key: string]: Value }): Promise<StoragePointer<DictRoot>> {
        const entries: StoragePointer<DictEntry>[] = [];
        for (const key in dict) {
            const valueSlot = await this.allocateValue(dict[key]);
            // TODO: Support UTF-16 keys.
            const entry = await this.heapAllocator.createSuperTailAlloc(
                AllocType.AsciiDictEntry,
                getTailStructType(asciiDictEntryType),
                key.length,
            );
            await this.writeStructField(entry, "value", valueSlot);
            const tailPointer = getTailPointer(entry, key.length);
            await this.write(tailPointer, Array.from(Buffer.from(key)));
            entries.push(entry);
        }
        return await this.allocateContentRoot(dictTreeTypes, entries);
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
    
    async readContent<T>(
        root: StoragePointer<ContentRoot<T>>,
        contentTreeTypes: ContentTreeTypes<T>,
        handle: (values: T[]) => Promise<void>,
    ): Promise<void> {
        const manager = new ContentTreeManager(this.heapAllocator, contentTreeTypes, root);
        await manager.iterateNodesForward(async (node) => {
            const accessor = await manager.createContentAccessorByNode(node);
            await handle(await accessor.getAllItems());
            return false;
        });
    }
    
    async readBuffer(root: StoragePointer<BufferRoot>): Promise<Buffer> {
        const buffers: Buffer[] = [];
        await this.readContent(root, bufferTreeTypes, async (values) => {
            buffers.push(Buffer.from(values));
        });
        return Buffer.concat(buffers);
    }
    
    async readString(root: StoragePointer<AsciiStringRoot>): Promise<string> {
        const textList: string[] = [];
        await this.readContent(root, asciiStringTreeTypes, async (values) => {
            textList.push(Buffer.from(values).toString("ascii"));
        });
        return textList.join("");
    }
    
    async readList(root: StoragePointer<ListRoot>): Promise<Value[]> {
        const indexRoot = await this.readStructField(root, "firstIndex");
        if (!indexRoot.isNull()) {
            throw new Error("Reading indexed lists is not yet implemented.");
        }
        const contentRoot = root.convert(contentListRootType);
        const output: Value[] = [];
        await this.readContent(contentRoot, contentListTreeTypes, async (valueSlots) => {
            for (const valueSlot of valueSlots) {
                output.push(await this.readValue(valueSlot));
            }
        });
        return output;
    }
    
    async readDict(
        root: StoragePointer<DictRoot>,
    ): Promise<{ [key: string]: Value }> {
        const output: { [key: string]: Value } = {};
        await this.readContent(root, dictTreeTypes, async (entries) => {
            for (const entry of entries) {
                // TODO: Support UTF-16 keys.
                const asciiEntry = entry.convert(asciiDictEntryType);
                const tailLength = await this.heapAllocator.getSuperTailLength(asciiEntry);
                const tailPointer = getTailPointer(asciiEntry, tailLength);
                const key = Buffer.from(await this.read(tailPointer)).toString("ascii");
                const valueSlot = await this.readStructField(asciiEntry, "value");
                const value = await this.readValue(valueSlot);
                output[key] = value;
            }
        });
        return output;
    }
    
    async readValue(valueSlot: ValueSlot): Promise<Value> {
        const { type: valueSlotType, data } = valueSlot;
        if (valueSlotType === ValueSlotType.Boolean) {
            return (data.readInt8() !== 0);
        } else if (valueSlotType === ValueSlotType.Number) {
            return data.readDoubleLE();
        } else if (valueSlotType === ValueSlotType.Null) {
            return null;
        } else if (valueSlotType === ValueSlotType.TreeRoot) {
            const pointerType = (new StoragePointerType<TreeRoot>()).init(treeRootType);
            const root = pointerType.read(data, 0);
            const rootAllocType = await this.readStructField(root, "type");
            if (rootAllocType === AllocType.BufferRoot) {
                return await this.readBuffer(root.convert(bufferRootType));
            } else if (rootAllocType === AllocType.AsciiStringRoot) {
                return await this.readString(root.convert(asciiStringRootType));
            } else if (rootAllocType === AllocType.ListRoot) {
                return await this.readList(root.convert(listRootType));
            } else if (rootAllocType === AllocType.DictRoot) {
                return await this.readDict(root.convert(dictRootType));
            } else {
                throw new Error(`Invalid value root type. (${valueSlotType})`);
            }
        } else {
            throw new Error(`Invalid value slot type. (${valueSlotType})`);
        }
    }
}


