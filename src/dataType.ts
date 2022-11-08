
import { Struct, TailStruct, TailStructElement } from "./internalTypes.js";
import { ParentTypes, ParentDataType, BaseDataType, BaseParamType, BaseReferenceType, BaseLiteralType, BaseAnyType, BaseBoolType, BaseIntType, BaseArrayType, BaseStoragePointerType, ParentMemberField, BaseMemberField, BaseStructType, BaseTailStructType, BaseTypeDeclaration } from "./baseTypes.js";
import { storagePointerSize } from "./constants.js";
import { StoragePointer } from "./storagePointer.js";

interface BuildTypes extends ParentTypes {
    dataType: DataType;
    memberField: MemberField;
    typeDeclaration: TypeDeclaration;
}

const baseDeclarationMap = new Map<string, BaseTypeDeclaration<BuildTypes>>();

export abstract class DataType<T = any> implements ParentDataType<BuildTypes> {
    base: BaseDataType<BuildTypes>;
    
    copyWithoutBase(): DataType {
        return new (this.constructor as (new() => DataType<T>))();
    }
    
    initWithBase(base: BaseDataType<BuildTypes>): void {
        this.base = base;
    }
    
    getAnyType(): BaseAnyType<BuildTypes> {
        return anyType.base;
    }
    
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
        return this.base.dereference().parent;
    }
}

export class ParamType extends DataType {
    base: BaseParamType<BuildTypes>;
    
    init(name: string): this {
        this.initWithBase(new BaseParamType<BuildTypes>(this, name));
        return this;
    }
    
    getErrorText(verb: string): string {
        return `Parameter type "${this.base.name}" has not been replaced.`;
    }
}

export class ReferenceType<T> extends DataType<T> {
    base: BaseReferenceType<BuildTypes>;
    
    init(name: string, paramReplacements: DataType[] | null = null): this {
        let baseReplacements: BaseDataType<BuildTypes>[] | null;
        if (paramReplacements === null) {
            baseReplacements = null;
        } else {
            baseReplacements = paramReplacements.map((replacement) => replacement.base);
        }
        this.initWithBase(new BaseReferenceType<BuildTypes>(
            this,
            baseDeclarationMap,
            name,
            baseReplacements,
        ));
        return this;
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
}

export abstract class LiteralType<T = any> extends DataType<T> {
    base: BaseLiteralType<BuildTypes>;
}

export class AnyType extends LiteralType {
    base: BaseAnyType<BuildTypes>;
    
    init(): this {
        this.initWithBase(new BaseAnyType<BuildTypes>(this));
        return this;
    }
}

export const anyType = (new AnyType()).init();

export class BoolType extends LiteralType<boolean> {
    base: BaseBoolType<BuildTypes>;
    
    init(): this {
        this.initWithBase(new BaseBoolType<BuildTypes>(this));
        return this;
    }
    
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

export const boolType = (new BoolType()).init();

export class IntType<T extends number = number> extends LiteralType<T> {
    base: BaseIntType<BuildTypes>;
    
    init(size: number): this {
        this.initWithBase(new BaseIntType<BuildTypes>(this, size));
        return this;
    }
    
    getSize(): number {
        return this.base.size;
    }
    
    read(data: Buffer, offset: number): T {
        return data.readIntLE(offset, this.getSize()) as T;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        data.writeIntLE(value, offset, this.getSize());
    }
}

export class StoragePointerType<T> extends LiteralType<StoragePointer<T>> {
    base: BaseStoragePointerType<BuildTypes>;
    
    init(elementType: DataType<T>): this {
        this.initWithBase(new BaseStoragePointerType<BuildTypes>(this, elementType.base));
        return this;
    }
    
    getSize(): number {
        return storagePointerSize;
    }
    
    read(data: Buffer, offset: number): StoragePointer<T> {
        const index = data.readIntLE(offset, storagePointerSize);
        return new StoragePointer(index, this.base.elementType.parent);
    }
    
    write(data: Buffer, offset: number, value: StoragePointer<T>): void {
        data.writeIntLE(value.index, offset, storagePointerSize);
    }
}

export class ArrayType<T> extends LiteralType<T[]> {
    base: BaseArrayType<BuildTypes>;
    
    init(elementType: DataType<T>, length: number): this {
        this.initWithBase(new BaseArrayType<BuildTypes>(this, elementType.base, length));
        return this;
    }
    
    getElementType(): DataType<T> {
        return this.base.elementType.parent;
    }
    
    getSize(): number {
        return this.base.elementType.parent.getSize() * this.base.length;
    }
    
    read(data: Buffer, offset: number): T[] {
        const elementSize = this.getElementType().getSize();
        const output: T[] = [];
        for (let index = 0; index < this.base.length; index++) {
            output.push(this.getElementType().read(data, offset + index * elementSize));
        }
        return output;
    }
    
    write(data: Buffer, offset: number, value: T[]): void {
        const elementSize = this.getElementType().getSize();
        for (let index = 0; index < this.base.length; index++) {
            this.getElementType().write(
                data,
                offset + index * elementSize,
                value[index],
            );
        }
    }
}

export class MemberField<T = any> implements ParentMemberField<BuildTypes> {
    base: BaseMemberField<BuildTypes>;
    
    initWithBase(base: BaseMemberField<BuildTypes>): void {
        this.base = base;
    }
    
    init(name: string, type: DataType<T>): this {
        this.initWithBase(new BaseMemberField<BuildTypes>(this, name, type.base));
        return this;
    }
    
    copyWithoutBase(): MemberField {
        return new (this.constructor as (new() => MemberField<T>))();
    }
}

export class ResolvedField<T = any> {
    name: string;
    type: DataType<T>;
    offset: number;
    
    constructor(name: string, type: DataType<T>, offset: number) {
        this.name = name;
        this.type = type;
        this.offset = offset;
    }
}

export class StructType<T extends Struct> extends LiteralType<T> {
    base: BaseStructType<BuildTypes>;
    fieldMap: Map<string, ResolvedField> | null;
    size: number | null;
    
    initWithBase(base: BaseDataType<BuildTypes>): void {
        super.initWithBase(base);
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
        this.base.initFieldsIfMissing();
        this.base.memberFields.forEach((field) => {
            const resolvedField = new ResolvedField(
                field.name,
                field.type.parent,
                this.size,
            );
            this.fieldMap.set(resolvedField.name, resolvedField);
            this.size += resolvedField.type.getSize();
        });
    }
    
    init(fields: MemberField[], superType: DataType<Partial<T>> | null = null): this {
        this.initWithBase(new BaseStructType<BuildTypes>(
            this,
            fields.map((field) => field.base),
            (superType === null) ? null : superType.base,
        ));
        return this;
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
}

export class TailStructType<T extends TailStruct = TailStruct> extends StructType<T> {
    base: BaseTailStructType<BuildTypes>;
    
    init(
        fields: MemberField[],
        superType: DataType<Partial<T>> | null = null,
        elementType: DataType<TailStructElement<T>> | null = null,
    ): this {
        this.initWithBase(new BaseTailStructType<BuildTypes>(
            this,
            fields.map((field) => field.base),
            (superType === null) ? null : superType.base,
            (elementType === null) ? null : elementType.base,
        ));
        return this;
    }
    
    getElementType(): DataType<TailStructElement<T>> {
        this.base.initElementTypeIfMissing();
        return this.base.elementType.parent;
    }
    
    getTailOffset(offset: number): number {
        return offset + this.getSize();
    }
    
    getSizeWithTail(length: number): number {
        return super.getSize() + this.getElementType().getSize() * length;
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
        const elementSize = this.getElementType().getSize();
        for (let index = 0; index < length; index++) {
            tail.push(this.getElementType().read(
                data,
                tailOffset + index * elementSize,
            ));
        }
        output._tail = tail;
        return output;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        super.write(data, offset, value);
        const tail = value._tail;
        const tailOffset = this.getTailOffset(offset);
        const elementSize = this.getElementType().getSize();
        for (let index = 0; index < tail.length; index++) {
            this.getElementType().write(
                data,
                tailOffset + index * elementSize,
                tail[index],
            );
        }
    }
}

export class TypeDeclaration {
    base: BaseTypeDeclaration<BuildTypes>;
    
    constructor(name: string, type: DataType, paramTypeNames: string[]) {
        this.base = new BaseTypeDeclaration<BuildTypes>(
            this,
            name,
            type.base,
            paramTypeNames,
        );
    }
}

export const addTypeDeclaration = <T extends DataType>(
    name: string,
    type: T,
    paramTypeNames: string[] = [],
): T => {
    const declaration = new TypeDeclaration(name, type, paramTypeNames);
    baseDeclarationMap.set(declaration.base.name, declaration.base);
    return type;
};


