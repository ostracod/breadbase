
import { spanDegreeAmount } from "./constants.js";
import { IntType, ArrayType, StructType } from "./dataType.js";

export interface StorageHeader {
    emptySpans: number[];
}

export const storageHeaderType = new StructType<StorageHeader>([
    { name: "emptySpans", type: new ArrayType(new IntType(6), spanDegreeAmount) },
]);

export interface SpanHeader {
    previousByNeighbor: number;
    nextByNeighbor: number;
    size: number;
    degree: number;
    isEmpty: number;
}

export const spanHeaderType = new StructType<SpanHeader>([
    { name: "previousByNeighbor", type: new IntType(6) },
    { name: "nextByNeighbor", type: new IntType(6) },
    { name: "size", type: new IntType(6) },
    { name: "degree", type: new IntType(1) },
    { name: "isEmpty", type: new IntType(1) },
]);

export interface EmptySpanHeader {
    previousByDegree: number;
    nextByDegree: number;
}

export const emptySpanHeaderType = new StructType<EmptySpanHeader>([
    { name: "previousByDegree", type: new IntType(6) },
    { name: "nextByDegree", type: new IntType(6) },
]);

export interface AllocHeader {
    type: number;
    size: number;
}

export const allocHeaderType = new StructType<AllocHeader>([
    { name: "type", type: new IntType(1) },
    { name: "size", type: new IntType(4) },
]);


