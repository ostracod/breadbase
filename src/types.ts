
// This is the version of `Value` which I would like to use, but it results
// in the error "Index signature is missing in type ...". See this issue:
// https://github.com/microsoft/TypeScript/issues/15300
//export type Value = null | boolean | number | string | Buffer | Value[] | { [key: string]: Value };
export type Value = any;

export interface Selector {
    type: string;
}

export interface DictEntrySelector extends Selector {
    type: "dictEntry";
    key?: string;
}

export interface ListSelector extends Selector {
    sort?: Sort;
    filter?: Filter;
}

export interface ListElemSelector extends ListSelector {
    type: "listElem";
    index?: number;
}

export interface ListElemsSelector extends ListSelector {
    type: "listElems";
    startIndex?: number;
    endIndex?: number;
}

export interface Filter {
    type: string;
}

export interface ComparisonFilter extends Filter {
    path: Selector[];
    value: Value;
}

export interface EqualFilter extends ComparisonFilter {
    type: "equal";
}

export interface Sort {
    type: string;
}

export interface ValueSort extends Sort {
    type: "value";
    path: Selector[];
    order?: "ascending" | "descending";
}

export interface Index {
    type: string;
}

export interface ValueIndex extends Index {
    type: "value";
    path: Selector[];
}

export interface Storage {
    getSize(): number;
    setSize(size: number): Promise<void>;
    read(index: number, size: number): Promise<Buffer>;
    write(index: number, data: Buffer): Promise<void>;
    getVersion(): number | null;
    markVersion(): Promise<void>;
}


