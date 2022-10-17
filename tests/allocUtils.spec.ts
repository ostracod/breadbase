
import * as allocUtils from "../src/allocUtils.js"

describe("allocUtils", () => {
    describe("findFirstBit", () => {
        it("returns the index of the first bit equal to one", () => {
            const indexes = [
                0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01, 0x00,
            ].map(allocUtils.findFirstBit);
            expect(indexes).toEqual([
                7, 6, 5, 4, 3, 2, 1, 0, -1
            ]);
        });
    });
    
    describe("convertDegreeToSize", () => {
        it("converts span degree to number of bytes", () => {
            const sizes = [
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
            ].map(allocUtils.convertDegreeToSize);
            expect(sizes).toEqual([
                0, 16, 32, 48, 64, 96, 128, 160, 192, 256, 320, 384, 448,
            ]);
        });
    });
    
    describe("convertSizeToDegree", () => {
        it("converts span degree to number of bytes", () => {
            const degrees = [
                63, 64, 65, 95, 96, 97, 127, 128, 129, 159, 160, 161, 191, 192, 193
            ].map(allocUtils.convertSizeToDegree);
            expect(degrees).toEqual([
                3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8
            ]);
        });
    });
});


