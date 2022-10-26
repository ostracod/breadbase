
import { TailStruct } from "./internalTypes.js";
import { StructType, TailStructType } from "./dataType.js";
import { TreeContent, stringAsciiCharsType } from "./builtTypes.js";
import { AllocType } from "./constants.js";
import { Storage } from "./storage.js";
import { StoragePointer, getStructFieldPointer, getTailElementPointer } from "./storagePointer.js";

const contentTypeMap: Map<AllocType, TailStructType<TreeContent & TailStruct>> = new Map([
    [AllocType.StringAsciiChars, stringAsciiCharsType],
]);

export class ContentAccessor {
    storage: Storage;
    content: StoragePointer<TreeContent & TailStruct>;
    tailStructType: TailStructType;
    startIndex: number;
    itemCount: number;
    bufferLength: number;
    
    async init(storage: Storage, content: StoragePointer<TreeContent>): Promise<void> {
        this.storage = storage;
        const allocType = await this.storage.read(getStructFieldPointer(content, "type"));
        const tailStructType = contentTypeMap.get(allocType);
        this.content = content.convert(tailStructType);
        this.startIndex = await this.readContentField("startIndex");
        this.itemCount = null;
        this.bufferLength = null;
    }
    
    async readContentField<T extends string & (keyof TreeContent)>(
        name: T,
    ): Promise<TreeContent[T]> {
        return this.storage.read(getStructFieldPointer(this.content, name));
    }
    
    async getItemCount(): Promise<number> {
        if (this.itemCount == null) {
            this.itemCount = await this.readContentField("itemCount");
        }
        return this.itemCount;
    }
    
    async readItem(index: number): Promise<any> {
        let bufferIndex: number;
        if (index === 0) {
            bufferIndex = this.startIndex;
        } else {
            if (this.bufferLength === null) {
                this.bufferLength = await this.readContentField("bufferLength");
            }
            bufferIndex = (this.startIndex + index) % this.bufferLength;
        }
        return await this.storage.read(getTailElementPointer(this.content, bufferIndex));
    }
}


