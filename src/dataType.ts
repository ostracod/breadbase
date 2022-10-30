
import { DataType, Struct, TailStruct, TailStructElement, Field, ResolvedField } from "./internalTypes.js";
import { storagePointerSize } from "./constants.js";
import { StoragePointer } from "./storagePointer.js";

export class AnyType implements DataType<any> {
    
    getSize(): number {
        throw new Error("Cannot get size of AnyType.");
    }
    
    read(data: Buffer, offset: number): boolean {
        throw new Error("Cannot read AnyType.");
    }
    
    write(data: Buffer, offset: number, value: boolean): void {
        throw new Error("Cannot write AnyType.");
    }
}

export const anyType = new AnyType();

export class BoolType implements DataType<boolean> {
    
    getSize(): number {
        return 1;
    }
    
    read(data: Buffer, offset: number): boolean {
        return (data.readInt8(offset) !== 0);
    }
    
    write(data: Buffer, offset: number, value: boolean): void {
        data.writeInt8(value ? 1 : 0, offset);
    }
}

export const boolType = new BoolType();

export class IntType<T extends number = number> implements DataType<T> {
    size: number;
    
    constructor(size: number) {
        this.size = size;
    }
    
    getSize(): number {
        return this.size;
    }
    
    read(data: Buffer, offset: number): T {
        return data.readIntLE(offset, this.size) as T;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        data.writeIntLE(value, offset, this.size);
    }
}

export class StoragePointerType<T> implements DataType<StoragePointer<T>> {
    elementType: DataType<T>;
    
    constructor(elementType: DataType<T> = null) {
        this.elementType = elementType;
    }
    
    getSize(): number {
        return storagePointerSize;
    }
    
    read(data: Buffer, offset: number): StoragePointer<T> {
        const index = data.readIntLE(offset, storagePointerSize);
        return new StoragePointer(index, this.elementType);
    }
    
    write(data: Buffer, offset: number, value: StoragePointer<T>): void {
        data.writeIntLE(value.index, offset, storagePointerSize);
    }
}

export class ArrayType<T> implements DataType<T[]> {
    elementType: DataType<T>;
    length: number;
    
    constructor(elementType: DataType<T>, length: number) {
        this.elementType = elementType;
        this.length = length;
    }
    
    getSize(): number {
        return this.elementType.getSize() * this.length;
    }
    
    read(data: Buffer, offset: number): T[] {
        const elementSize = this.elementType.getSize();
        const output: T[] = [];
        for (let index = 0; index < this.length; index++) {
            output.push(this.elementType.read(data, offset + index * elementSize));
        }
        return output;
    }
    
    write(data: Buffer, offset: number, value: T[]): void {
        const elementSize = this.elementType.getSize();
        for (let index = 0; index < this.length; index++) {
            this.elementType.write(data, offset + index * elementSize, value[index]);
        }
    }
}

export class StructType<T extends Struct> implements DataType<T> {
    fieldMap: Map<string, ResolvedField>;
    size: number;
    
    constructor(fields: Field[], superType?: StructType<Partial<T>>) {
        this.fieldMap = new Map();
        this.size = 0;
        if (typeof superType !== "undefined") {
            superType.fieldMap.forEach((field) => {
                this.addField(field);
            });
        }
        for (const field of fields) {
            this.addField(field);
        }
    }
    
    addField(field: Field) {
        const resolvedField: ResolvedField = { ...field, offset: this.size };
        this.fieldMap.set(resolvedField.name, resolvedField);
        this.size += resolvedField.type.getSize();
    }
    
    getSize(): number {
        return this.size;
    }
    
    read(data: Buffer, offset: number): T {
        const output: any = {};
        this.fieldMap.forEach((field) => {
            output[field.name] = field.type.read(data, offset + field.offset);
        });
        return output as T;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        this.fieldMap.forEach((field) => {
            field.type.write(data, offset + field.offset, (value as any)[field.name]);
        });
    }
    
    getField<T2 extends string & (keyof T)>(name: T2): ResolvedField<T[T2]> {
        return this.fieldMap.get(name) as ResolvedField<T[T2]>;
    }
}

export class TailStructType<T extends TailStruct = TailStruct> extends StructType<T> {
    elementType: DataType<TailStructElement<T>>;
    
    constructor(
        fields: Field[],
        elementType: DataType<TailStructElement<T>>,
        superType?: StructType<Partial<T>>,
    ) {
        super(fields, superType);
        this.elementType = elementType;
    }
    
    getTailOffset(offset: number): number {
        return offset + this.getSize();
    }
    
    getSizeWithTail(length: number): number {
        return super.getSize() + this.elementType.getSize() * length;
    }
    
    // Note that this method does not (and cannot) read the struct tail.
    // Use the method `readWithTail` to include the tail.
    read(data: Buffer, offset: number): T {
        const output = super.read(data, offset);
        output._tail = null;
        return output;
    }
    
    readWithTail(data: Buffer, offset: number, length: number): T {
        const output = super.read(data, offset);
        const tail: TailStructElement<T>[] = [];
        const tailOffset = this.getTailOffset(offset);
        const elementSize = this.elementType.getSize();
        for (let index = 0; index < length; index++) {
            tail.push(this.elementType.read(data, tailOffset + index * elementSize));
        }
        output._tail = tail;
        return output;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        super.write(data, offset, value);
        const tail = value._tail;
        const tailOffset = this.getTailOffset(offset);
        const elementSize = this.elementType.getSize();
        for (let index = 0; index < tail.length; index++) {
            this.elementType.write(data, tailOffset + index * elementSize, tail[index]);
        }
    }
}


