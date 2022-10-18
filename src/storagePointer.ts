
import { DataType } from "./dataType.js";

export class StoragePointer<T> {
    index: number;
    type: DataType<T>;
    
    constructor(index: number, type: DataType<T>) {
        this.index = index;
        this.type = type;
    }
}

export class NullPointer<T> extends StoragePointer<T> {
    
    constructor(type: DataType<T>) {
        super(0, type);
    }
}


