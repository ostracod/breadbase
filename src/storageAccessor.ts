
import { Struct, TailStruct } from "./internalTypes.js";
import { TailStructType } from "./dataType.js";
import { StoragePointer, getStructFieldPointer, getTailElementPointer } from "./storagePointer.js";
import { Storage } from "./storage.js";

export class StorageAccessor {
    storage: Storage;
    
    setStorage(storage: Storage) {
        this.storage = storage;
    }
    
    async read<T>(pointer: StoragePointer<T>): Promise<T> {
        const data = await this.storage.read(pointer.index, pointer.type.getSize());
        return pointer.type.read(data, 0);
    }
    
    async readTailStruct<T extends TailStruct>(
        pointer: StoragePointer<T>,
        length: number,
    ): Promise<T> {
        const tailStructType = pointer.type as TailStructType<T>;
        const size = tailStructType.getSizeWithTail(length);
        const data = await this.storage.read(pointer.index, size);
        return tailStructType.readWithTail(data, 0, length);
    }
    
    async write<T>(pointer: StoragePointer<T>, value: T): Promise<void> {
        const data = Buffer.alloc(pointer.type.getSize());
        pointer.type.write(data, 0, value);
        await this.storage.write(pointer.index, data);
    }
    
    async readStructField<T1 extends Struct, T2 extends string & (keyof T1)>(
        pointer: StoragePointer<T1>,
        name: T2,
    ): Promise<T1[T2]> {
        return await this.read(getStructFieldPointer(pointer, name));
    }
    
    async writeStructField<T1 extends Struct, T2 extends string & (keyof T1)>(
        pointer: StoragePointer<T1>,
        name: T2,
        value: T1[T2],
    ): Promise<void> {
        await this.write(getStructFieldPointer(pointer, name), value);
    }
    
    async writeStructFields<T extends Struct>(
        pointer: StoragePointer<T>,
        values: Partial<T>,
    ): Promise<void> {
        for (const key in values) {
            await this.writeStructField(pointer, key, values[key]);
        }
    }
    
    async readTailElement<T>(
        pointer: StoragePointer<TailStruct<T>>,
        index: number,
    ): Promise<T> {
        return await this.read(getTailElementPointer(pointer, index));
    }
    
    async writeTailElement<T>(
        pointer: StoragePointer<TailStruct<T>>,
        index: number,
        value: T,
    ): Promise<void> {
        await this.write(getTailElementPointer(pointer, index), value);
    }
}


