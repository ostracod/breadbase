
import { TreeDirection } from "./constants.js";
import { NodeChildKey } from "./internalTypes.js";

export const findFirstBit = (value: number): number => {
    if (value <= 0) {
        return -1;
    }
    let output = 0;
    if (value > 0x0000FFFF) {
        value >>= 16;
        output += 16;
    }
    if (value > 0x000000FF) {
        value >>= 8;
        output += 8;
    }
    if (value > 0x0000000F) {
        value >>= 4;
        output += 4;
    }
    if (value > 0x00000003) {
        value >>= 2;
        output += 2;
    }
    if (value > 0x00000001) {
        value >>= 1;
        output += 1;
    }
    return output;
};

export const convertDegreeToSize = (degree: number): number => {
    // A degree equal to -1 indicates the final span in storage.
    if (degree < 0) {
        return -1;
    }
    const exponent = degree >> 2;
    return (64 << exponent) + (16 << exponent) * (degree & 3) - 64;
};

export const convertSizeToDegree = (size: number): number => {
    if (size < 0) {
        return -1;
    }
    const adjustedSize = size + 64;
    const exponent = findFirstBit(adjustedSize) - 6;
    return (exponent << 2) + ((adjustedSize - (64 << exponent)) >> (exponent + 4));
};

export const getOppositeDirection = (direction: TreeDirection): TreeDirection => (
    (direction === TreeDirection.Forward) ? TreeDirection.Backward : TreeDirection.Forward
);

export const getChildKey = (direction: TreeDirection): NodeChildKey => (
    (direction === TreeDirection.Forward) ? "rightChild" : "leftChild"
);

export const getOppositeChildKey = (direction: TreeDirection): NodeChildKey => (
    getChildKey(getOppositeDirection(direction))
);


