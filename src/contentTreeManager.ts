
import { ContentItem, ContentSearchResult } from "./internalTypes.js";
import { AllocType, TreeDirection } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { TailStructType, getTailStructType } from "./dataType.js";
import { ContentRoot, ContentNode, TreeContent } from "./builtTypes.js";
import { ContentTreeTypes } from "./internalTypes.js";
import { StoragePointer, createNullPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { ContentAccessor } from "./contentAccessor.js";
import { ContentNodeAccessor } from "./nodeAccessor.js";

export class ContentTreeManager<T> extends StorageAccessor {
    heapAllocator: HeapAllocator;
    treeTypes: ContentTreeTypes<T>;
    contentTailStructType: TailStructType<TreeContent<T>>;
    nodeAccessor: ContentNodeAccessor<T>;
    root: StoragePointer<ContentRoot<T>>;
    
    constructor(
        heapAllocator: HeapAllocator,
        treeTypes: ContentTreeTypes<T>,
        root: StoragePointer<ContentRoot<T>>,
    ) {
        super();
        this.heapAllocator = heapAllocator;
        this.setStorage(this.heapAllocator.storage);
        this.treeTypes = treeTypes;
        this.contentTailStructType = getTailStructType(this.treeTypes.contentDataType);
        this.root = root;
        this.nodeAccessor = new ContentNodeAccessor<T>(
            this.storage,
            this.treeTypes.nodeDataType,
            this.treeTypes.rootDataType,
        );
    }
    
    async getRootChild(): Promise<StoragePointer<ContentNode<T>>> {
        return await this.readStructField(this.root, "child");
    }
    
    async setRootChild(node: StoragePointer<ContentNode<T>>): Promise<void> {
        await this.nodeAccessor.setRootChild(this.root, node);
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
    
    async iterateNodesHelper(
        node: StoragePointer<ContentNode<T>>,
        direction: TreeDirection,
        handle: (node: StoragePointer<ContentNode<T>>) => Promise<boolean>,
    ): Promise<boolean> {
        const previousChild = await this.nodeAccessor.readBranchesField(
            node,
            allocUtils.getOppositeChildKey(direction),
        );
        if (!previousChild.isNull()) {
            const result = await this.iterateNodesHelper(previousChild, direction, handle);
            if (result) {
                return true;
            }
        }
        const result = await handle(node);
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
            return await this.iterateNodesHelper(nextChild, direction, handle);
        }
    }
    
    async iterateNodesForward(
        // When return value is true, iteration will stop early.
        handle: (node: StoragePointer<ContentNode<T>>) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.getRootChild();
        await this.iterateNodesHelper(node, TreeDirection.Forward, handle);
    }
    
    async iterateNodesBackward(
        // When return value is true, iteration will stop early.
        handle: (node: StoragePointer<ContentNode<T>>) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.getRootChild();
        await this.iterateNodesHelper(node, TreeDirection.Backward, handle);
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
    
    async iterateItemsHelper(
        direction: TreeDirection,
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.getRootChild();
        await this.iterateNodesHelper(node, direction, async (inputNode) => (
            await this.iterateContent(inputNode, direction, handle)
        ));
    }
    
    async iterateItemsForward(
        // When return value is true, iteration will stop early.
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        await this.iterateItemsHelper(TreeDirection.Forward, handle);
    }
    
    async iterateItemsBackward(
        // When return value is true, iteration will stop early.
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        await this.iterateItemsHelper(TreeDirection.Backward, handle);
    }
    
    // Returns the first item for which `compare` returns 0 or 1.
    // `this.root` must be sorted by `compare`.
    async findItemByComparison(
        // `compare` returns 0 if `value` has match, 1 if `value`
        // is too late, and -1 if `value` is too early.
        compare: (value: T) => Promise<number>,
    ): Promise<ContentSearchResult<T>> {
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
                const comparisonResult = await compare(value);
                if (comparisonResult >= 0) {
                    return {
                        item: { accessor: contentAccessor, index },
                        isEqual: (comparisonResult === 0),
                    };
                }
            }
            node = await this.nodeAccessor.getNextNode(node);
            if (node === null) {
                return {
                    item: { accessor: contentAccessor, index: itemCount },
                    isEqual: false,
                };
            }
        }
    }
    
    async createContent(
        parent: StoragePointer<ContentNode<T>>,
        bufferLength: number,
        values: T[],
    ): Promise<StoragePointer<TreeContent<T>>> {
        const output = await this.heapAllocator.createSuperTailAlloc(
            this.treeTypes.contentAllocType,
            this.contentTailStructType,
            bufferLength,
        );
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
        bufferLength: number,
        values: T[],
    ): Promise<StoragePointer<ContentNode<T>>> {
        const output = await this.heapAllocator.createSuperAlloc(
            AllocType.ContentNode,
            this.treeTypes.nodeDataType,
        );
        const content = await this.createContent(
            output,
            bufferLength,
            values,
        );
        await this.writeStructField(output, "treeContent", content);
        const nullContentNodePointer = createNullPointer(this.treeTypes.nodeDataType);
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
    
    // `value` will be inserted before `nextItem`.
    async insertItem(value: T, nextItem: ContentItem<T>): Promise<void> {
        await this.insertItems([value], nextItem);
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
    
    async deleteItem(item: ContentItem<T>): Promise<void> {
        const nextItem = { accessor: item.accessor, index: item.index + 1 };
        await this.deleteItems(item, nextItem);
    }
    
    async deleteTreeHelper(
        node: StoragePointer<ContentNode<T>>,
        cleanUpItems: ((items: T[]) => Promise<void> | null) = null,
    ): Promise<void> {
        const leftChild = await this.nodeAccessor.readBranchesField(node, "leftChild");
        await this.deleteTreeHelper(leftChild, cleanUpItems);
        const rightChild = await this.nodeAccessor.readBranchesField(node, "rightChild");
        await this.deleteTreeHelper(rightChild, cleanUpItems);
        const content = await this.readStructField(node, "treeContent");
        if (cleanUpItems !== null) {
            const accessor = await this.createContentAccessor(content);
            const items = await accessor.getAllItems();
            await cleanUpItems(items);
        }
        await this.heapAllocator.deleteAlloc(content);
        await this.heapAllocator.deleteAlloc(node);
    }
    
    async deleteTree(
        cleanUpItems: ((items: T[]) => Promise<void> | null) = null,
    ): Promise<void> {
        const node = await this.getRootChild();
        await this.deleteTreeHelper(node, cleanUpItems);
        await this.heapAllocator.deleteAlloc(this.root);
    }
}


