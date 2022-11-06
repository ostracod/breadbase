
import { ParamMap, Struct, TailStruct, TailStructElement, Field, ResolvedField } from "./internalTypes.js";
import { storagePointerSize } from "./constants.js";
import { StoragePointer } from "./storagePointer.js";

const typeDeclarationMap = new Map<string, TypeDeclaration>();

export abstract class DataType<T = any> {
    paramTypeNames: string[];
    
    constructor() {
        this.paramTypeNames = [];
    }
    
    abstract replaceParamTypes(paramMap: ParamMap): DataType<T>;
    
    getErrorText(verb: string): string {
        return `Cannot ${verb} ${this.constructor.name}.`;
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
        this.dereferencedType = null;
    }
    
    getSize(): number {
        return this.dereference().getSize();
    }
    
    read(data: Buffer, offset: number): T {
        return this.dereference().read(data, offset);
    }
    
    write(data: Buffer, offset: number, value: T): void {
        return this.dereference().write(data, offset, value);
    }
    
    getDeclaration(): TypeDeclaration {
        return typeDeclarationMap.get(this.name);
    }
    
    getNonNullReplacements(): DataType[] {
        if (this.paramReplacements === null) {
            return this.getDeclaration().paramTypeNames.map((name) => anyType);
        } else {
            return this.paramReplacements;
        }
    }
    
    dereference(): LiteralType {
        if (this.dereferencedType !== null) {
            return this.dereferencedType;
        }
        const declaration = this.getDeclaration();
        let { type } = declaration;
        const paramMap = new Map<string, DataType>();
        this.getNonNullReplacements().forEach((paramReplacement, index) => {
            const name = declaration.paramTypeNames[index];
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
    
    replaceParamTypes(paramMap: ParamMap): DataType<StoragePointer<T>> {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        return new StoragePointerType(elementType);
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
    
    replaceParamTypes(paramMap: ParamMap): DataType<T[]> {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        return new ArrayType(elementType, this.length);
    }
}

export class StructType<T extends Struct> extends LiteralType<T> {
    subTypeFields: Field[];
    superType: DataType<Partial<T>> | null;
    fieldMap: Map<string, ResolvedField> | null;
    size: number | null;
    
    constructor(fields: Field[], superType: DataType<Partial<T>> | null = null) {
        super();
        this.subTypeFields = fields;
        this.superType = superType;
        // We delay initialization of the field map in case superType is a ReferenceType.
        this.fieldMap = null;
        this.size = null;
    }
    
    initFieldsIfMissing(): void {
        if (this.fieldMap !== null) {
            return;
        }
        this.fieldMap = new Map();
        this.size = 0;
        if (this.superType !== null) {
            const structType = this.superType.dereference() as StructType<Partial<T>>;
            structType.getFieldMap().forEach((field) => {
                this.addField(field);
            });
        }
        for (const field of this.subTypeFields) {
            this.addField(field);
        }
    }
    
    addField(field: Field) {
        const resolvedField: ResolvedField = { ...field, offset: this.size };
        this.fieldMap.set(resolvedField.name, resolvedField);
        this.size += resolvedField.type.getSize();
    }
    
    getFieldMap(): Map<string, ResolvedField> {
        this.initFieldsIfMissing();
        return this.fieldMap;
    }
    
    getSize(): number {
        this.initFieldsIfMissing();
        return this.size;
    }
    
    read(data: Buffer, offset: number): T {
        const output: any = {};
        this.getFieldMap().forEach((field) => {
            output[field.name] = field.type.read(data, offset + field.offset);
        });
        return output as T;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        this.getFieldMap().forEach((field) => {
            field.type.write(data, offset + field.offset, (value as any)[field.name]);
        });
    }
    
    getField<T2 extends string & (keyof T)>(name: T2): ResolvedField<T[T2]> {
        return this.getFieldMap().get(name) as ResolvedField<T[T2]>;
    }
    
    replaceParamsHelper(
        paramMap: ParamMap,
    ): { fields: Field[], superType: DataType<Partial<T>> } {
        const fields = this.subTypeFields.map((field) => ({
            name: field.name,
            type: field.type.replaceParamTypes(paramMap),
        }));
        let superType: DataType<Partial<T>> | null;
        if (this.superType === null) {
            superType = null;
        } else {
            superType = this.superType.replaceParamTypes(paramMap);
        }
        return { fields, superType };
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType<T> {
        const { fields, superType } = this.replaceParamsHelper(paramMap);
        return new StructType(fields, superType);
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
    
    replaceParamTypes(paramMap: ParamMap): DataType<T> {
        const { fields, superType } = this.replaceParamsHelper(paramMap);
        const elementType = this.elementType.replaceParamTypes(paramMap);
        return new TailStructType(fields, elementType, superType);
    }
}

export class TypeDeclaration {
    name: string;
    type: DataType;
    paramTypeNames: string[];
    
    constructor(name: string, type: DataType, paramTypeNames: string[]) {
        this.name = name;
        this.type = type;
        this.paramTypeNames = paramTypeNames;
    }
}

export const addTypeDeclaration = <T extends DataType>(
    name: string,
    type: T,
    paramTypeNames: string[] = [],
): T => {
    const declaration = new TypeDeclaration(name, type, paramTypeNames);
    typeDeclarationMap.set(declaration.name, declaration);
    return type;
};


