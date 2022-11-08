
import { ContentItem } from "./internalTypes.js";
import { AllocType, TreeDirection } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { TailStructType } from "./dataType.js";
import { allocType, ContentRoot, ContentNode, contentNodeType, TreeContent } from "./builtTypes.js";
import { StoragePointer, createNullPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { ContentAccessor, contentTypeMap } from "./contentAccessor.js";
import { ContentNodeAccessor } from "./nodeAccessor.js";

const nullContentNodePointer = createNullPointer(contentNodeType);

export class ContentTreeManager<T> extends StorageAccessor {
    heapAllocator: HeapAllocator;
    nodeAccessor: ContentNodeAccessor<T>;
    root: StoragePointer<ContentRoot<T>>;
    
    constructor(heapAllocator: HeapAllocator, root: StoragePointer<ContentRoot<T>>) {
        super();
        this.heapAllocator = heapAllocator;
        this.setStorage(this.heapAllocator.storage);
        this.nodeAccessor = new ContentNodeAccessor<T>(this.storage);
        this.root = root;
    }
    
    async getRootChild(): Promise<StoragePointer<ContentNode<T>>> {
        return await this.readStructField(this.root, "child");
    }
    
    async createContentAccessor(
        content: StoragePointer<TreeContent<T>>,
    ): Promise<ContentAccessor<T>> {
        const output = new ContentAccessor<T>();
        await output.init(this, content);
        return output;
    }
    
    async createContentAccessorByNode(
        node: StoragePointer<ContentNode<T>>,
    ): Promise<ContentAccessor<T>> {
        const content = await this.readStructField(node, "treeContent");
        return await this.createContentAccessor(content);
    }
    
    async findItemByIndex(
        index: number,
    ): Promise<ContentItem<T>> {
        let startIndex = 0;
        let node = await this.getRootChild();
        while (true) {
            const content = await this.readStructField(node, "treeContent");
            const itemCount = await this.readStructField(content, "itemCount");
            const leftChild = await this.nodeAccessor.readBranchesField(node, "leftChild");
            let leftIndex = startIndex;
            if (!leftChild.isNull()) {
                leftIndex += await this.nodeAccessor.readBranchesField(
                    leftChild,
                    "totalLength",
                );
            }
            if (index >= leftIndex) {
                const rightIndex = leftIndex + itemCount;
                if (index < rightIndex) {
                    const accessor = await this.createContentAccessor(content);
                    return { accessor, index: index - leftIndex };
                } else {
                    startIndex = rightIndex;
                    node = await this.nodeAccessor.readBranchesField(node, "rightChild");
                }
            } else {
                node = leftChild;
            }
        }
    }
    
    async iterateContent(
        node: StoragePointer<ContentNode<T>>,
        direction: TreeDirection,
        handle: (value: T) => Promise<boolean>,
    ): Promise<boolean> {
        const accessor = await this.createContentAccessorByNode(node);
        const itemCount = await accessor.getField("itemCount");
        let startIndex: number;
        let endIndex: number;
        if (direction > 0) {
            startIndex = 0;
            endIndex = itemCount;
        } else {
            startIndex = itemCount - 1;
            endIndex = -1;
        }
        for (let index = startIndex; index !== endIndex; index += direction) {
            const value = await accessor.getItem(index);
            const result = await handle(value);
            if (result) {
                return true;
            }
        }
        return false;
    }
    
    async iterateTreeHelper(
        node: StoragePointer<ContentNode<T>>,
        direction: TreeDirection,
        handle: (value: T) => Promise<boolean>,
    ): Promise<boolean> {
        const previousChild = await this.nodeAccessor.readBranchesField(
            node,
            allocUtils.getOppositeChildKey(direction),
        );
        if (!previousChild.isNull()) {
            const result = await this.iterateTreeHelper(previousChild, direction, handle);
            if (result) {
                return true;
            }
        }
        const result = await this.iterateContent(node, direction, handle);
        if (result) {
            return true;
        }
        const nextChild = await this.nodeAccessor.readBranchesField(
            node,
            allocUtils.getChildKey(direction),
        );
        if (nextChild.isNull()) {
            return false;
        } else {
            return await this.iterateTreeHelper(nextChild, direction, handle);
        }
    }
    
    async iterateTreeForward(
        // When return value is true, iteration will stop early.
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.getRootChild();
        await this.iterateTreeHelper(node, TreeDirection.Forward, handle);
    }
    
    async iterateTreeBackward(
        // When return value is true, iteration will stop early.
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.getRootChild();
        await this.iterateTreeHelper(node, TreeDirection.Backward, handle);
    }
    
    // Returns the first item for which `compare` returns 0 or 1.
    // `this.root` must be sorted by `compare`.
    async findItemByComparison(
        // `compare` returns 0 if `value` has match, 1 if `value`
        // is too late, and -1 if `value` is too early.
        compare: (value: T) => Promise<number>,
    ): Promise<ContentItem<T>> {
        let node = await this.getRootChild();
        let startNode: StoragePointer<ContentNode<T>> = null;
        while (!node.isNull()) {
            const contentAccessor = await this.createContentAccessorByNode(node);
            const value = await contentAccessor.getItem(0);
            if (await compare(value) < 0) {
                startNode = node;
                node = await this.nodeAccessor.readBranchesField(node, "rightChild");
            } else {
                node = await this.nodeAccessor.readBranchesField(node, "leftChild");
            }
        }
        node = startNode;
        while (true) {
            const contentAccessor = await this.createContentAccessorByNode(node);
            const itemCount = await contentAccessor.getField("itemCount");
            // TODO: Use binary search.
            for (let index = 0; index < itemCount; index++) {
                const value = await contentAccessor.getItem(index);
                if (await compare(value) >= 0) {
                    return { accessor: contentAccessor, index };
                }
            }
            node = await this.nodeAccessor.getNextNode(node);
        }
        return null;
    }
    
    async createContent(
        parent: StoragePointer<ContentNode<T>>,
        contentAllocType: AllocType,
        bufferLength: number,
        values: T[],
    ): Promise<StoragePointer<TreeContent<T>>> {
        const contentType = contentTypeMap.get(contentAllocType) as TailStructType<TreeContent<T>>;
        const output = (await this.heapAllocator.createAlloc(
            contentAllocType,
            contentType.getSizeWithTail(bufferLength) - allocType.getSize(),
        )).convert(contentType);
        await this.writeStructFields(output, {
            parent,
            itemCount: values.length,
        });
        for (let index = 0; index < values.length; index++) {
            await this.writeTailElement(output, index, values[index]);
        }
        return output;
    }
    
    async createNode(
        contentAllocType: AllocType,
        bufferLength: number,
        values: T[],
    ): Promise<StoragePointer<ContentNode<T>>> {
        const output = (await this.heapAllocator.createAlloc(
            AllocType.ContentNode,
            contentNodeType.getSize() - allocType.getSize(),
        )).convert(contentNodeType);
        const content = await this.createContent(
            output,
            contentAllocType,
            bufferLength,
            values,
        );
        await this.writeStructField(output, "treeContent", content);
        await this.nodeAccessor.writeBranchesField(
            output, "leftChild", nullContentNodePointer,
        );
        await this.nodeAccessor.writeBranchesField(
            output, "rightChild", nullContentNodePointer,
        );
        await this.nodeAccessor.writeBranchesField(
            output, "maximumDepth", 1,
        );
        await this.nodeAccessor.writeBranchesField(
            output, "totalLength", values.length,
        );
        return output;
    }
    
    async deleteNode(node: StoragePointer<ContentNode<T>>) {
        await this.nodeAccessor.removeNode(node);
        const content = await this.readStructField(node, "treeContent");
        await this.heapAllocator.deleteAlloc(content);
        await this.heapAllocator.deleteAlloc(node);
    }
    
    // `values` will be inserted before `nextItem`.
    async insertItems(values: T[], nextItem: ContentItem<T>): Promise<void> {
        const { accessor, index } = nextItem;
        let bufferLength = await accessor.getBufferLength();
        const itemCount = await accessor.getField("itemCount");
        const totalCount = itemCount + values.length;
        const defaultLength = accessor.getDefaultBufferLength();
        if (itemCount - index > accessor.getMaximumMoveLength()) {
            const nextValues = await accessor.getAndInsertItems(index, values);
            await accessor.shatter(nextValues);
        } else if (totalCount <= bufferLength) {
            await accessor.insertItems(index, values);
        } else if (bufferLength < defaultLength) {
            bufferLength = Math.max(totalCount, defaultLength);
            const nextValues = await accessor.getAndInsertItems(index, values);
            await accessor.resizeBuffer(bufferLength, nextValues);
        } else {
            await accessor.insertItemsWithOverflow(index, values);
        }
    }
    
    // `startIndex` is inclusive, and `endIndex` is exclusive.
    async deleteItemsHelper(
        accessor: ContentAccessor,
        startIndex: number,
        endIndex: number,
    ): Promise<void> {
        const itemCount = await accessor.getField("itemCount");
        if (itemCount - endIndex > accessor.getMaximumMoveLength()) {
            const nextValues = await accessor.getAndDeleteItems(startIndex, endIndex);
            await accessor.shatter(nextValues);
            return;
        }
        const countAfterDeletion = itemCount - (endIndex - startIndex);
        let bufferLength = await accessor.getBufferLength();
        const hasLowUsage = (countAfterDeletion / bufferLength < 0.25);
        const defaultLength = accessor.getDefaultBufferLength();
        if (bufferLength >= defaultLength * 2 && hasLowUsage) {
            bufferLength = Math.max(countAfterDeletion * 2, defaultLength);
            const nextValues = await accessor.getAndDeleteItems(startIndex, endIndex);
            await accessor.resizeBuffer(bufferLength, nextValues);
        } else {
            await accessor.deleteItems(startIndex, endIndex);
            if (hasLowUsage) {
                await accessor.borrowItems();
            }
        }
    }
    
    // `startItem` is inclusive, and `endItem` is exclusive.
    async deleteItems(
        startItem: ContentItem<T>,
        endItem: ContentItem<T>,
    ): Promise<void> {
        const { accessor: startAccessor, index: startIndex } = startItem;
        const { accessor: endAccessor, index: endIndex } = endItem;
        const startNode = await startAccessor.getField("parent");
        const endNode = await endAccessor.getField("parent");
        // We iterate backward here, because `deleteItemsHelper` may borrow
        // items from the next node (but not the previous node).
        let node = endNode;
        while (node !== null) {
            const contentAccessor = await this.createContentAccessorByNode(node);
            const itemCount = await contentAccessor.getField("itemCount");
            let previousNode: StoragePointer<ContentNode<T>> | null;
            let tempStartIndex: number;
            if (node.index === startNode.index) {
                previousNode = null;
                tempStartIndex = startIndex;
            } else {
                previousNode = await this.nodeAccessor.getPreviousNode(node);
                tempStartIndex = 0;
            }
            let tempEndIndex: number;
            if (node.index === endNode.index) {
                tempEndIndex = endIndex;
            } else {
                tempEndIndex = itemCount;
            }
            if (tempStartIndex <= 0 && tempEndIndex >= itemCount) {
                await this.deleteNode(node);
            } else {
                await this.deleteItemsHelper(contentAccessor, tempStartIndex, tempEndIndex);
            }
            node = previousNode;
        }
    }
}

