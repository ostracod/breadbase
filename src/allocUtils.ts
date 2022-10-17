
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
    const exponent = degree >> 2;
    return (64 << exponent) + (16 << exponent) * (degree & 3) - 64;
};

export const convertSizeToDegree = (size: number): number => {
    const adjustedSize = size + 64;
    const exponent = findFirstBit(adjustedSize) - 6;
    return (exponent << 2) + ((adjustedSize - (64 << exponent)) >> (exponent + 4));
};


