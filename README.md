
# BreadBase

This repository is a Node.js module which manages a non-relational database in the local file system. The module exports the following members:

* `BreadBase`: Provides methods to access the database.
* `types`: Provides TypeScript types and interfaces used by this module.

## Database Description

BreadBase is able to store the following types of values:

* Booleans
* Floating point numbers
* Strings
* Buffers
* Lists
* Dictionaries
* Null

Strings, buffers, and lists are considered to be "sequences". Sequences support insertion and deletion at arbitrary offsets with reasonable efficiency. Insertion and deletion at the end of a sequence is most efficient.

Each sequence is implemented as a self-balancing binary search tree, where each node stores an array of elements. BreadBase assumes that elements inserted together will likely remain contiguous. When inserting a large subsequence at the end of a sequence, BreadBase stores the elements in a large node array. However, if an insertion is later requested in the middle of the large array, BreadBase will "shatter" the array into many smaller nodes. This improves efficiency in the case of future middle insertions.

In a traditional database, data is separated by "document" or "row", and indexing may only be performed at the top level. However, BreadBase does not have this restriction. Instead, BreadBase stores a single "root" value, and any list within the root value may be indexed. This allows for a more flexible database structure.

## Installation

This project has the following system-wide dependencies:

* Node.js version ^16.4
* TypeScript version ^4.5
* pnpm version ^6.24

To use this repository as a dependency, add the following line to `dependencies` in your `package.json` file, replacing `(version)` with the desired version number:

```
"breadbase": "github:ostracod/breadbase#semver:^(version)"
```

To install this repository for local development and testing, perform these steps:

1. Clone this repository, and navigate to the directory: `cd breadbase`
1. Install dependencies of this repository: `pnpm install`
1. Compile the TypeScript code: `npm run build`
1. Run code linter: `npm run lint`
1. Run automated tests: `npm run test`

## TypeScript Types

```
type Value = boolean | number | string | Buffer | Value[] | { [key: string]: Value } | null
```

Represents a value which may be stored in the database.

```
interface DictEntrySelector extends Selector {
    type: "dictEntry";
    key: string;
}
```

Refers to a value in the parent dictionary with the given key.

```
interface SeqElemSelector extends Selector {
    type: "seqElem";
    sort?: Sort;
    filter?: Filter;
    index?: number;
}
```

Refers to an element in the parent sequence with the given index. The default value of `index` is zero. `index` may be negative to refer to an offset from the end of the parent sequence. `sort` and `filter` are applied before selecting the element at `index`.

```
interface SeqElemsSelector extends Selector {
    type: "seqElems";
    sort?: Sort;
    filter?: Filter;
    startIndex?: number;
    endIndex?: number;
    maxAmount?: number;
    direction?: "forward" | "backward";
}
```

Refers to a range of elements in the parent sequence starting at `startIndex` in the given direction. `startIndex` is inclusive, and has a default value of zero. The default value of `direction` is `forward`. `SeqElemsSelector` may behave in one of three ways:

* If `endIndex` is provided, the selector returns elements between `startIndex` and `endIndex`. `endIndex` is exclusive.
* If `maxAmount` is provided, the selector returns up to `maxAmount` elements starting at `startIndex`.
* If neither `endIndex` nor `maxAmount` are provided, the selector returns elements from `startIndex` to the beginning or end of the parent sequence.

`endIndex` and `maxAmount` are mutually exclusive. Both `startIndex` and `endIndex` may be negative to refer to an offset from the end of the parent sequence. `sort` and `filter` are applied before selecting the range of elements.

```
type Path = Selector[]
```

Refers to nested values which may be one or more levels deep within the parent.

```
interface EqualFilter extends Filter {
    type: "equal";
    path: Path;
    value: Value;
}
```

Matches all elements whose value at `path` is equal to `value`.

```
interface ValueSort extends Sort {
    type: "value";
    path: Path;
}
```

Specifies that elements in the sequence should be sorted by their values at `path` in ascending order.

```
interface ValueIndex extends Index {
    type: "value";
    path: Path;
}
```

Specifies that elements in the list should be indexed by their values at `path`. The list index will improve the efficiency of filters and sorts which use values at the same path.

## BreadBase Class

```
new BreadBase()
```

Creates an instance of the `BreadBase` class. You must call the `init` method on the instance before any other methods.

```
breadBase.init(directoryPath: string): Promise<void>
```

Initializes the `BreadBase` instance to read from the database in `directoryPath`. If a directory does not exist at `directoryPath`, `init` will create one.

```
breadBase.load(path: Path): Promise<Value | Value[]>
```

Reads child values from the root value at `path`. The output type will be `Value[]` if any selector in `path` is `SeqElemsSelector`, and will be `Value` otherwise.

```
breadBase.set(path: Path, value: Value): Promise<void>
```

Replaces child values in the root value at `path`. If the last selector in `path` is `DictEntrySelector` and the dictionary is missing the given key, `set` will create a new entry.

```
breadBase.appendElem(path: Path, value: Value): Promise<void>
```

Adds one element to the end of the sequence at `path` in the root value.

```
breadBase.appendElems(path: Path, values: Value[]): Promise<void>
```

Adds several elements to the end of the sequence at `path` in the root value.

```
breadBase.delete(path: Path): Promise<void>
```

Deletes child values from the root value at `path`. If the child value is within a dictionary, `delete` will delete the dictionary entry. If the child value is within a sequence, `delete` will shift all elements afterward to the left.

```
breadBase.addIndex(path: Path, index: Index): Promise<void>
```

Indexes the list at `path` within the root value.

```
breadBase.removeIndex(path: Path, index: Index): Promise<void>
```

Removes the index of the list at `path` within the root value.

```
breadBase.getIndexes(path: Path): Promise<Index[]>
```

Retrieves all indexes of the list at `path` within the root value.


