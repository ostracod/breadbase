
import { ParamMap, Struct, TailStruct, TailStructElement, Field, ResolvedField } from "./internalTypes.js";
import { storagePointerSize } from "./constants.js";
import { StoragePointer } from "./storagePointer.js";

let namedTypes: { [name: string]: DataType };

export const setNamedTypes = (inputNamedTypes: { [name: string]: DataType }): void => {
    namedTypes = inputNamedTypes;
};

export abstract class DataType<T = any> {
    paramTypeNames: string[];
    
    constructor() {
        this.paramTypeNames = [];
    }
    
    abstract replaceParamTypes(paramMap: ParamMap): DataType<T>;
    
    getErrorText(verb: string): string {
        return `Cannot "${verb}" ${this.constructor.name}.`;
    }
    
    getSize(): number {
        throw new Error(this.getErrorText("get size of"));
    }
    
    read(data: Buffer, offset: number): T {
        throw new Error(this.getErrorText("read"));
    }
    
    write(data: Buffer, offset: number, value: T): void {
        throw new Error(this.getErrorText("write"));
    }
    
    dereference(): LiteralType<T> {
        throw new Error(this.getErrorText("dereference"));
    }
    
    setParamTypeNames(names: string[]): void {
        this.paramTypeNames = names;
    }
}

export class ParamType extends DataType {
    name: string;
    
    constructor(name: string) {
        super();
        this.name = name;
    }
    
    getErrorText(verb: string): string {
        return `Parameter type "${this.name}" has not been replaced.`;
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        const replacement = paramMap.get(this.name);
        return (typeof replacement === "undefined") ? this : replacement;
    }
}

export class ReferenceType<T> extends DataType<T> {
    name: string;
    paramReplacements: DataType[] | null;
    dereferencedType: LiteralType | null;
    
    constructor(name: string, paramReplacements: DataType[] | null = null) {
        super();
        this.name = name;
        this.paramReplacements = paramReplacements;
    }
    
    getNamedType(): DataType {
        return namedTypes[this.name];
    }
    
    getNonNullReplacements(): DataType[] {
        if (this.paramReplacements === null) {
            return this.getNamedType().paramTypeNames.map((name) => anyType);
        } else {
            return this.paramReplacements;
        }
    }
    
    dereference(): LiteralType {
        if (this.dereferencedType !== null) {
            return this.dereferencedType;
        }
        let type = namedTypes[this.name];
        const paramMap = new Map<string, DataType>();
        this.getNonNullReplacements().forEach((paramReplacement, index) => {
            const name = type.paramTypeNames[index];
            paramMap.set(name, paramReplacement);
        });
        type = type.replaceParamTypes(paramMap);
        this.dereferencedType = type.dereference();
        return this.dereferencedType;
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        let replacements: DataType[] | null;
        if (this.paramReplacements === null) {
            replacements = null;
        } else {
            replacements = this.paramReplacements.map((replacement) => (
                replacement.replaceParamTypes(paramMap)
            ));
        }
        return new ReferenceType(this.name, replacements);
    }
}

export class LiteralType<T = any> extends DataType<T> {
    
    dereference(): LiteralType<T> {
        return this;
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        return this;
    }
}

export class AnyType extends LiteralType {
    
}

export const anyType = new AnyType();

export class BoolType extends LiteralType<boolean> {
    
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

export class IntType<T extends number = number> extends LiteralType<T> {
    size: number;
    
    constructor(size: number) {
        super();
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

export class StoragePointerType<T> extends LiteralType<StoragePointer<T>> {
    elementType: DataType<T>;
    
    constructor(elementType: DataType<T> = null) {
        super();
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

export class ArrayType<T> extends LiteralType<T[]> {
    elementType: DataType<T>;
    length: number;
    
    constructor(elementType: DataType<T>, length: number) {
        super();
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

export class StructType<T extends Struct> extends LiteralType<T> {
    fieldMap: Map<string, ResolvedField>;
    size: number;
    
    constructor(fields: Field[], superType?: DataType<Partial<T>>) {
        super();
        this.fieldMap = new Map();
        this.size = 0;
        if (typeof superType !== "undefined") {
            const structType = superType.dereference() as StructType<Partial<T>>;
            structType.fieldMap.forEach((field) => {
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
        superType?: DataType<Partial<T>>,
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


