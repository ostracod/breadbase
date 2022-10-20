
import { DataType, Struct } from "./internalTypes.js";
import { ArrayType, StructType } from "./dataType.js";

export class StoragePointer<T> {
    index: number;
    type: DataType<T>;
    
    constructor(index: number, type: DataType<T>) {
        this.index = index;
        this.type = type as DataType<T>;
    }
}

export class NullPointer<T> extends StoragePointer<T> {
    
    constructor(type: DataType<T>) {
        super(0, type);
    }
}

export const getArrayElementPointer = <T>(
    pointer: StoragePointer<T[]>,
    index: number,
): StoragePointer<T> => {
    const { elementType } = pointer.type as ArrayType<T>;
    const elementSize = elementType.getSize();
    return new StoragePointer(pointer.index + index * elementSize, elementType);
};

export const getStructFieldPointer = <T1 extends Struct, T2 extends string & (keyof T1)>(
    pointer: StoragePointer<T1>,
    name: T2,
): StoragePointer<T1[T2]> => {
    const structType = pointer.type as StructType<T1>;
    const field = structType.getField(name);
    return new StoragePointer(pointer.index + field.offset, field.type);
};


