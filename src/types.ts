
// This is the version of `Value` which I would like to use, but it results
// in the error "Index signature is missing in type ...". See this issue:
// https://github.com/microsoft/TypeScript/issues/15300
//export type Value = null | boolean | number | string | Buffer | Value[] | { [key: string]: Value };
export type Value = any;

export type Direction = "forward" | "backward";

export interface Selector {
    type: string;
}

export interface DictEntrySelector extends Selector {
    type: "dictEntry";
    key: string;
}

export interface SeqSelector extends Selector {
    sort?: Sort;
    filter?: Filter;
}

export interface SeqElemSelector extends SeqSelector {
    type: "seqElem";
    index?: number;
}

export interface SeqElemsSelector extends SeqSelector {
    type: "seqElems";
    startIndex?: number;
    endIndex?: number;
    maxAmount?: number;
    direction?: Direction;
}

export type Path = Selector[];

export interface Filter {
    type: string;
}

export interface ComparisonFilter extends Filter {
    path: Path;
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
    path: Path;
}

export interface Index {
    type: string;
}

export interface ValueIndex extends Index {
    type: "value";
    path: Path;
}


