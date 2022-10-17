
export interface DataType<T> {
    getSize(): number;
    read(data: Buffer, offset: number): T;
    write(data: Buffer, offset: number, value: T): void;
}

export class IntType extends DataType<number> {
    bitAmount: number;
    
    constructor(bitAmount: number) {
        this.bitAmount = bitAmount;
    }
    
    getSize(): number {
        return Math.ceil(this.bitAmount / 8);
    }
    
    read(data: Buffer, offset: number): number {
        if (this.bitAmount === 8) {
            return data.readInt8(offset);
        } else if (this.bitAmount === 16) {
            return data.readInt16LE(offset);
        } else if (this.bitAmount === 32) {
            return data.readInt32LE(offset);
        } else if (this.bitAmount === 64) {
            return data.readInt64LE(offset);
        } else {
            throw new Error(`Unsupported integer bit amount ${this.bitAmount}.`);
        }
    }
    
    write(data: Buffer, offset: number, value: number): void {
        if (this.bitAmount === 8) {
            data.writeInt8(value, offset);
        } else if (this.bitAmount === 16) {
            return data.writeInt16LE(value, offset);
        } else if (this.bitAmount === 32) {
            return data.writeInt32LE(value, offset);
        } else if (this.bitAmount === 64) {
            return data.writeInt64LE(value, offset);
        } else {
            throw new Error(`Unsupported integer bit amount ${this.bitAmount}.`);
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
            output[field.name] = field.dataType.read(data, offset + field.offset);
        });
        return output as T;
    }
    
    write(data: Buffer, offset: number, value: T): void {
        this.fieldMap.forEach((field) => {
            field.dataType.write(data, offset + field.offset, (value as any)[field.name]);
        });
    }
}


