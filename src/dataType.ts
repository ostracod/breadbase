
import { StoragePointer } from "./internalTypes.js";

export interface DataType<T = any> {
    getSize(): number;
    read(data: Buffer, offset: number): T;
    write(data: Buffer, offset: number, value: T): void;
}

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

export class StoragePointerType<T> extends IntType<StoragePointer<T>> {
    
    constructor() {
        super(6);
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

export interface Field {
    name: string;
    type: DataType;
}

export interface ResolvedField extends Field {
    offset: number;
}

export class StructType<T> implements DataType<T> {
    fieldMap: Map<string, ResolvedField>;
    size: number;
    
    constructor(fields: Field[]) {
        this.fieldMap = new Map();
        let offset = 0;
        for (const field of fields) {
            const resolvedField: ResolvedField = { ...field, offset };
            this.fieldMap.set(resolvedField.name, resolvedField);
            offset += resolvedField.type.getSize();
        }
        this.size = offset;
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
}


