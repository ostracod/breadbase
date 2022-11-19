
import { ContentSearchResult } from "./internalTypes.js";
import { Value, Sort, Filter, DictEntrySelector, SeqElemSelector, SeqElemsSelector } from "./types.js";
import { ValueSlot, ContentRoot, DictRoot, DictEntry } from "./builtTypes.js";
import { dictTreeTypes } from "./contentTreeTypes.js";
import { TreeDirection } from "./constants.js";
import { getWithDefault } from "./niceUtils.js";
import { StoragePointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { readContentItem } from "./contentAccessor.js";
import { ContentTreeManager } from "./contentTreeManager.js";
import { ValueManager } from "./valueManager.js";

export abstract class Selection extends StorageAccessor {
    valueManager: ValueManager;
    
    constructor(valueManager: ValueManager) {
        super();
        this.valueManager = valueManager;
        this.setStorage(this.valueManager.storage);
    }
    
    abstract load(): Promise<Value[]>;
    
    abstract set(value: Value): Promise<void>;
    
    abstract delete(): Promise<void>;
}

export abstract class SingleSelection extends Selection {
    
    abstract getValueSlot(): Promise<ValueSlot>;
    
    async load(): Promise<Value[]> {
        const valueSlot = await this.getValueSlot();
        return [await this.valueManager.readValue(valueSlot)];
    }
}

export class RootSelection extends SingleSelection {
    
    async getValueSlot(): Promise<ValueSlot> {
        return await this.valueManager.getRootValue();
    }
    
    async set(value: Value): Promise<void> {
        const valueSlot = await this.valueManager.allocateValue(value);
        await this.valueManager.setRootValue(valueSlot);
    }
    
    async delete(): Promise<void> {
        throw new Error("Cannot delete root BreadBase value.");
    }
}

export class DictEntrySelection extends SingleSelection {
    treeManager: ContentTreeManager<StoragePointer<DictEntry>>;
    key: string;
    
    constructor(
        valueManager: ValueManager,
        selector: DictEntrySelector,
        root: StoragePointer<DictRoot>,
    ) {
        super(valueManager);
        this.treeManager = this.valueManager.createContentTreeManager(root, dictTreeTypes);
        this.key = selector.key;
    }
    
    async findEntry(): Promise<ContentSearchResult<StoragePointer<DictEntry>>> {
        return await this.treeManager.findItemByComparison(async (entry) => {
            const key = await this.valueManager.readDictEntryKey(entry);
            if (key > this.key) {
                return 1;
            } else if (key < this.key) {
                return -1;
            } else {
                return 0;
            }
        });
    }
    
    async getValueSlot(): Promise<ValueSlot> {
        const { item, isEqual } = await this.findEntry();
        if (!isEqual) {
            throw new Error(`Could not find key "${this.key}" in dictionary.`);
        }
        const entry = await readContentItem(item);
        return await this.readStructField(entry, "value");
    }
    
    async set(value: Value): Promise<void> {
        const valueSlot = await this.valueManager.allocateValue(value);
        const { item, isEqual } = await this.findEntry();
        if (isEqual) {
            const entry = await item.accessor.getItem(item.index);
            const oldValueSlot = await this.readStructField(entry, "value");
            await this.valueManager.cleanUpValue(oldValueSlot);
            await this.writeStructField(entry, "value", valueSlot);
        } else {
            const entry = await this.valueManager.allocateDictEntry(this.key, valueSlot);
            await this.treeManager.insertItem(entry, item);
        }
    }
    
    async delete(): Promise<void> {
        const { item, isEqual } = await this.findEntry();
        if (!isEqual) {
            return;
        }
        const entry = await readContentItem(item);
        await this.valueManager.cleanUpDictEntry(entry);
        await this.treeManager.deleteItem(item);
    }
}

export abstract class SeqElemSelection extends SingleSelection {
    sort: Sort | null;
    filter: Filter | null;
    index: number;
    
    constructor(valueManager: ValueManager, selector: SeqElemSelector) {
        super(valueManager);
        this.sort = getWithDefault(selector, "sort");
        this.filter = getWithDefault(selector, "filter");
        this.index = getWithDefault(selector, "index", 0);
    }
}

export class ContentElemSelection<T> extends SeqElemSelection {
    root: StoragePointer<ContentRoot<T>>;
    
    constructor(
        valueManager: ValueManager,
        selector: SeqElemSelector,
        root: StoragePointer<ContentRoot<T>>,
    ) {
        super(valueManager, selector);
        this.root = root;
    }
    
    async getValueSlot(): Promise<ValueSlot> {
        throw new Error("Not yet implemented.");
    }
    
    async set(value: Value): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    async delete(): Promise<void> {
        throw new Error("Not yet implemented.");
    }
}

export abstract class MultiSelection extends Selection {
    
    abstract iterate(handle: (selection: SingleSelection) => Promise<void>): Promise<void>;
}

export abstract class SeqElemsSelection extends MultiSelection {
    sort: Sort | null;
    filter: Filter | null;
    startIndex: number;
    endIndex: number | null;
    maxAmount: number | null;
    direction: TreeDirection;
    
    constructor(valueManager: ValueManager, selector: SeqElemsSelector) {
        super(valueManager);
        this.sort = getWithDefault(selector, "sort");
        this.filter = getWithDefault(selector, "filter");
        this.startIndex = getWithDefault(selector, "startIndex", 0);
        this.endIndex = getWithDefault(selector, "endIndex");
        this.maxAmount = getWithDefault(selector, "maxAmount");
        const direction = getWithDefault(selector, "direction", "forward");
        this.direction = (direction === "forward") ? TreeDirection.Forward : TreeDirection.Backward;
    }
}

export abstract class ContentElemsSelection<T> extends SeqElemsSelection {
    root: StoragePointer<ContentRoot<T>>;
    
    constructor(
        valueManager: ValueManager,
        selector: SeqElemsSelector,
        root: StoragePointer<ContentRoot<T>>,
    ) {
        super(valueManager, selector);
        this.root = root;
    }
    
    async iterate(handle: (selection: SingleSelection) => Promise<void>): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    async load(): Promise<Value[]> {
        throw new Error("Not yet implemented.");
    }
    
    async set(value: Value): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    async delete(): Promise<void> {
        throw new Error("Not yet implemented.");
    }
}


