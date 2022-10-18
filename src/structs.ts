
import { spanDegreeAmount } from "./constants.js";
import { boolType, IntType, StoragePointerType, ArrayType, StructType } from "./dataType.js";
import { StoragePointer } from "./storagePointer.js";

const spanPointerType = new StoragePointerType<SpanHeader>();

export interface StorageHeader {
    emptySpansByDegree: StoragePointer<SpanHeader>[];
    finalSpan: StoragePointer<SpanHeader>;
}

export const storageHeaderType = new StructType<StorageHeader>([
    {
        name: "emptySpansByDegree",
        type: new ArrayType(spanPointerType, spanDegreeAmount),
    },
    { name: "finalSpan", type: spanPointerType },
]);

export interface SpanHeader {
    previousByNeighbor: StoragePointer<SpanHeader>;
    nextByNeighbor: StoragePointer<SpanHeader>;
    size: number;
    degree: number;
    isEmpty: boolean;
}

export const spanHeaderType = new StructType<SpanHeader>([
    { name: "previousByNeighbor", type: spanPointerType },
    { name: "nextByNeighbor", type: spanPointerType },
    { name: "size", type: new IntType(6) },
    { name: "degree", type: new IntType(1) },
    { name: "isEmpty", type: boolType },
]);

export interface EmptySpanHeader {
    previousByDegree: StoragePointer<SpanHeader>;
    nextByDegree: StoragePointer<SpanHeader>;
}

export const emptySpanHeaderType = new StructType<EmptySpanHeader>([
    { name: "previousByDegree", type: spanPointerType },
    { name: "nextByDegree", type: spanPointerType },
]);

export interface AllocHeader {
    type: number;
    size: number;
}

export const allocHeaderType = new StructType<AllocHeader>([
    { name: "type", type: new IntType(1) },
    { name: "size", type: new IntType(4) },
]);

// TODO: Make this less awkward.
spanPointerType.elementType = spanHeaderType;


