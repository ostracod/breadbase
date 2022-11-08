
export const spanDegreeAmount = 90;
export const storagePointerSize = 6;
export const defaultContentSize = 50;

export enum AllocType {
    BufferRoot = 1,
    AsciiStringRoot = 2,
    Utf16StringRoot = 3,
    ListRoot = 4,
    DictRoot = 5,
    ValueIndexRoot = 6,
    ContentNode = 7,
    IndexedNode = 8,
    BufferContent = 9,
    AsciiStringContent = 10,
    Utf16StringContent = 11,
    ListContent = 12,
    DictContent = 13,
    AsciiDictEntry = 14,
    Utf16DictEntry = 15,
    EntrySelector = 16,
    ElemSelector = 17,
    AmountSelector = 18,
    RangeSelector = 19,
    ValueSort = 20,
    EqualFilter = 21,
}

export enum TreeDirection {
    Backward = -1,
    Forward = 1,
}

export enum ValueSlotType {
    Null = 1,
    Boolean = 2,
    Number = 3,
    TreeRoot = 4,
}


