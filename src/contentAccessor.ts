
import { TailStruct } from "./internalTypes.js";
import { StructType, TailStructType } from "./dataType.js";
import { TreeContent, stringAsciiCharsType } from "./builtTypes.js";
import { AllocType } from "./constants.js";
import { Storage } from "./storage.js";
import { StoragePointer, getStructFieldPointer, getTailElementPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";

export const contentTypeMap: Map<AllocType, TailStructType<TreeContent & TailStruct>> = new Map([
    [AllocType.StringAsciiChars, stringAsciiCharsType],
]);

export class ContentAccessor extends StorageAccessor {
    content: StoragePointer<TreeContent & TailStruct>;
    tailStructType: TailStructType;
    itemCount: number;
    bufferLength: number;
    
    async init(storage: Storage, content: StoragePointer<TreeContent>): Promise<void> {
        this.setStorage(storage);
        const allocType = await this.readStructField(content, "type");
        const tailStructType = contentTypeMap.get(allocType);
        this.content = content.convert(tailStructType);
        this.itemCount = null;
    }
    
    async readContentField<T extends string & (keyof TreeContent)>(
        name: T,
    ): Promise<TreeContent[T]> {
        return this.read(getStructFieldPointer(this.content, name));
    }
    
    async getItemCount(): Promise<number> {
        if (this.itemCount == null) {
            this.itemCount = await this.readContentField("itemCount");
        }
        return this.itemCount;
    }
    
    async readItem(index: number): Promise<any> {
        return await this.read(getTailElementPointer(this.content, index));
    }
}


