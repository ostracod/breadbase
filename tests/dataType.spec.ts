
import { Struct, TailStruct } from "../src/internalTypes.js";
import { BoolType, boolType, IntType, ArrayType, MemberField, StructType, TailStructType } from "../src/dataType.js";

describe("ArrayType", () => {
    const arrayType = (new ArrayType()).init((new IntType()).init(2), 3);
    
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
    
    describe("write", () => {
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
    const structType = (new StructType<MyStruct>()).init([
        (new MemberField()).init("x", (new IntType()).init(2)),
        (new MemberField()).init("y", (new IntType()).init(4)),
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
    
    describe("write", () => {
        it("writes the struct to a buffer", () => {
            const data = Buffer.alloc(10, 99);
            structType.write(data, 3, { x: 5, y: 10 });
            expect(data.compare(Buffer.from([99, 99, 99, 5, 0, 10, 0, 0, 0, 99]))).toEqual(0);
        });
    });
    
    describe("inheritance", () => {
        it("inherits fields of super type", () => {
            interface MyStruct2 extends MyStruct {
                z: boolean,
            }
            const structType2 = (new StructType<MyStruct2>()).init([
                (new MemberField()).init("z", (new BoolType()).init()),
            ], structType);
            expect(structType2.getSize()).toEqual(7);
            expect(structType2.getField("x").offset).toEqual(0);
            expect(structType2.getField("y").offset).toEqual(2);
            expect(structType2.getField("z").offset).toEqual(6);
        });
    });
});

describe("TailStructType", () => {
    interface MyTailStruct extends TailStruct<boolean> {
        x: number,
        y: number,
    }
    const tailStructType = (new TailStructType<MyTailStruct>()).init([
        (new MemberField()).init("x", (new IntType()).init(2)),
        (new MemberField()).init("y", (new IntType()).init(1)),
    ], null, boolType);
    
    describe("read", () => {
        it("reads the tail struct from a buffer without tail", () => {
            const data = Buffer.from([99, 99, 99, 5, 0, 10, 0, 1, 0, 99]);
            const value = tailStructType.read(data, 3);
            expect(value).toEqual({ x: 5, y: 10, _tail: null });
        });
    });
    
    describe("readWithTail", () => {
        it("reads the tail struct from a buffer with tail", () => {
            const data = Buffer.from([99, 99, 99, 5, 0, 10, 0, 1, 0, 99]);
            const value = tailStructType.readWithTail(data, 3, 3);
            expect(value).toEqual({ x: 5, y: 10, _tail: [false, true, false] });
        });
    });
    
    describe("write", () => {
        it("writes the tail struct to a buffer", () => {
            const data = Buffer.alloc(10, 99);
            tailStructType.write(data, 3, { x: 5, y: 10, _tail: [false, true, false] });
            expect(data.compare(Buffer.from([99, 99, 99, 5, 0, 10, 0, 1, 0, 99]))).toEqual(0);
        });
    });
});


