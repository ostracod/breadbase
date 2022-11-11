
import { Struct, TailStruct } from "./internalTypes.js";
import { TreeBranches, ContentNode } from "./builtTypes.js";
import { DataType, StoragePointerType, ArrayType, StructType, getTailStructType } from "./dataType.js";

export class StoragePointer<T> {
    index: number;
    type: DataType<T>;
    
    constructor(index: number, type: DataType<T>) {
        this.index = index;
        this.type = type as DataType<T>;
    }
    
    isNull(): boolean {
        return (this.index === 0);
    }
    
    convert<T2>(type: DataType<T2>): StoragePointer<T2> {
        return new StoragePointer(this.index, type);
    }
    
    getPointerType(): StoragePointerType<T> {
        return (new StoragePointerType<T>()).init(this.type);
    }
}

export const createNullPointer = <T>(type: DataType<T>): StoragePointer<T> => (
    new StoragePointer(0, type)
);

export const getArrayElementPointer = <T>(
    pointer: StoragePointer<T[]>,
    index: number,
): StoragePointer<T> => {
    const arrayType = pointer.type.dereference() as ArrayType<T>;
    const elementType = arrayType.getElementType();
    const elementSize = elementType.getSize();
    return new StoragePointer(pointer.index + index * elementSize, elementType);
};

export const getStructFieldPointer = <T1 extends Struct, T2 extends string & (keyof T1)>(
    pointer: StoragePointer<T1>,
    name: T2,
): StoragePointer<T1[T2]> => {
    const structType = pointer.type.dereference() as StructType<T1>;
    const field = structType.getField(name);
    return new StoragePointer(pointer.index + field.offset, field.type);
};

export const getTailPointerHelper = <T>(
    pointer: StoragePointer<TailStruct<T>>,
): { tailIndex: number, elementType: DataType<T> } => {
    const tailStructType = getTailStructType(pointer.type);
    const tailIndex = tailStructType.getTailOffset(pointer.index);
    const elementType = tailStructType.getElementType();
    return { tailIndex, elementType };
};

export const getTailElementPointer = <T>(
    pointer: StoragePointer<TailStruct<T>>,
    index: number,
): StoragePointer<T> => {
    const { tailIndex, elementType } = getTailPointerHelper(pointer);
    const elementSize = elementType.getSize();
    return new StoragePointer(tailIndex + index * elementSize, elementType);
};

export const getTailPointer = <T>(
    pointer: StoragePointer<TailStruct<T>>,
    length: number,
): StoragePointer<T[]> => {
    const { tailIndex, elementType } = getTailPointerHelper(pointer);
    const arrayType = (new ArrayType<T>()).init(elementType, length);
    return new StoragePointer(tailIndex, arrayType);
};

export const getBranchesFieldPointer = <T1 extends ContentNode, T2 extends string & (keyof TreeBranches)>(node: StoragePointer<T1>, name: T2): StoragePointer<T1["branches"][T2]> => (
    getStructFieldPointer(getStructFieldPointer(node, "branches"), name)
);


