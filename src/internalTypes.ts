
export interface DataType<T = any> {
    getSize(): number;
    read(data: Buffer, offset: number): T;
    write(data: Buffer, offset: number, value: T): void;
}

export interface Struct {
    _flavor?: { name: "Struct" };
}

export interface TailStruct<T> extends Struct {
    _tail: T[];
}

export interface Field<T = any> {
    name: string;
    type: DataType<T>;
}

export interface ResolvedField<T = any> extends Field<T> {
    offset: number;
}


