
import { ContentTreeTypes } from "./internalTypes.js";
import { bufferRootType, bufferNodeType, bufferContentType, asciiStringRootType, asciiStringNodeType, asciiStringContentType, dictRootType, dictNodeType, dictContentType, contentListRootType, contentListNodeType, listContentType, DictEntry, ValueSlot } from "./builtTypes.js";
import { AllocType } from "./constants.js";
import { StoragePointer } from "./storagePointer.js";

export const bufferTreeTypes: ContentTreeTypes<number> = {
    rootDataType: bufferRootType,
    rootAllocType: AllocType.BufferRoot,
    nodeDataType: bufferNodeType,
    contentDataType: bufferContentType,
    contentAllocType: AllocType.BufferContent,
};

export const asciiStringTreeTypes: ContentTreeTypes<number> = {
    rootDataType: asciiStringRootType,
    rootAllocType: AllocType.AsciiStringRoot,
    nodeDataType: asciiStringNodeType,
    contentDataType: asciiStringContentType,
    contentAllocType: AllocType.AsciiStringContent,
};

export const dictTreeTypes: ContentTreeTypes<StoragePointer<DictEntry>> = {
    rootDataType: dictRootType,
    rootAllocType: AllocType.DictRoot,
    nodeDataType: dictNodeType,
    contentDataType: dictContentType,
    contentAllocType: AllocType.DictContent,
};

export const contentListTreeTypes: ContentTreeTypes<ValueSlot> = {
    rootDataType: contentListRootType,
    rootAllocType: AllocType.ListRoot,
    nodeDataType: contentListNodeType,
    contentDataType: listContentType,
    contentAllocType: AllocType.ListContent,
};


