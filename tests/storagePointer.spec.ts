
import { Struct } from "../src/internalTypes.js";
import { IntType, ArrayType, StructType } from "../src/dataType.js"
import { StoragePointer, getArrayElementPointer, getStructFieldPointer } from "../src/storagePointer.js"

describe("getArrayElementPointer", () => {
    it("creates a pointer to an element in an array", async () => {
        const arrayPointer = new StoragePointer(100, new ArrayType(new IntType(4), 10));
        const elementPointer: StoragePointer<number> = getArrayElementPointer(
            arrayPointer, 5,
        );
        expect(elementPointer.index).toEqual(120);
        expect(elementPointer.type instanceof IntType).toEqual(true);
    });
});

describe("getStructFieldPointer", () => {
    it("creates a pointer to a field in a struct", async () => {
        interface MyStruct extends Struct {
            x: number,
            y: number,
        }
        const structType = new StructType<MyStruct>([
            { name: "x", type: new IntType(2) },
            { name: "y", type: new IntType(4) },
        ]);
        const structPointer = new StoragePointer(100, structType);
        const elementPointer: StoragePointer<number> = getStructFieldPointer(
            structPointer, "y",
        );
        expect(elementPointer.index).toEqual(102);
        expect(elementPointer.type instanceof IntType).toEqual(true);
    });
});


