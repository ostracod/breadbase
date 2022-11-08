
import { ContentAccessor } from "./contentAccessor.js";

export interface Struct {
    _flavor?: { name: "Struct" };
}

export interface TailStruct<T = any> extends Struct {
    _tail: T[];
}

export type TailStructElement<T> = T extends TailStruct<infer T2> ? T2 : never;

export interface ContentItem<T = any> {
    accessor: ContentAccessor<T>;
    // Number of items after `startIndex` in tree content.
    index: number;
}

export type NodeChildKey = "leftChild" | "rightChild";


