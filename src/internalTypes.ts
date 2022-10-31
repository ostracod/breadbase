
import { ContentAccessor } from "./contentAccessor.js";

export interface DataType<T = any> {
    getSize(): number;
    read(data: Buffer, offset: number): T;
    write(data: Buffer, offset: number, value: T): void;
}

export interface Struct {
    _flavor?: { name: "Struct" };
}

export interface TailStruct<T = any> extends Struct {
    _tail: T[];
}

export type TailStructElement<T> = T extends TailStruct<infer T2> ? T2 : never;

export interface Field<T = any> {
    name: string;
    type: DataType<T>;
}

export interface ResolvedField<T = any> extends Field<T> {
    offset: number;
}

export interface TreeItem<T = any> {
    accessor: ContentAccessor<T>;
    // Number of items after `startIndex` in tree content.
    index: number;
}

export type NodeChildKey = "leftChild" | "rightChild";

export interface TreeNodeMetrics {
    depth: number;
    length: number;
}


