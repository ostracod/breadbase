
import { Struct } from "../src/internalTypes.js";
import { IntType, ArrayType, StructType } from "../src/dataType.js"

describe("ArrayType", () => {
    const arrayType = new ArrayType(new IntType(2), 3);
    
    describe("getSize", () => {
        it("retrieves the size of the array", () => {
            expect(arrayType.getSize()).toEqual(6);
        });
    });
    
    describe("read", () => {
        it("reads the struct from a buffer", () => {
            const data = Buffer.from([99, 99, 99, 5, 0, 10, 0, 15, 0, 99]);
            const value = arrayType.read(data, 3);
            expect(value).toEqual([5, 10, 15]);
        });
    });
    
    describe("read", () => {
        it("writes the struct to a buffer", () => {
            const data = Buffer.alloc(10, 99);
            arrayType.write(data, 3, [5, 10, 15]);
            expect(data.compare(Buffer.from([99, 99, 99, 5, 0, 10, 0, 15, 0, 99]))).toEqual(0);
        });
    });
});

describe("StructType", () => {
    interface MyStruct extends Struct {
        x: number,
        y: number,
    }
    const structType = new StructType<MyStruct>([
        { name: "x", type: new IntType(2) },
        { name: "y", type: new IntType(4) },
    ]);
    
    describe("getSize", () => {
        it("retrieves the size of the struct", () => {
            expect(structType.getSize()).toEqual(6);
        });
    });
    
    describe("read", () => {
        it("reads the struct from a buffer", () => {
            const data = Buffer.from([99, 99, 99, 5, 0, 10, 0, 0, 0, 99]);
            const value = structType.read(data, 3);
            expect(value).toEqual({ x: 5, y: 10 });
        });
    });
    
    describe("read", () => {
        it("writes the struct to a buffer", () => {
            const data = Buffer.alloc(10, 99);
            structType.write(data, 3, { x: 5, y: 10 });
            expect(data.compare(Buffer.from([99, 99, 99, 5, 0, 10, 0, 0, 0, 99]))).toEqual(0);
        });
    });
});


