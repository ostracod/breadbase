
import { TreeItem, NodeChildKey } from "./internalTypes.js";
import { AllocType, TreeDirection } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { TailStructType } from "./dataType.js";
import { Alloc, allocType, TreeRoot, treeRootType, TreeNode, treeNodeType, TreeContent } from "./builtTypes.js";
import { StoragePointer, createNullPointer } from "./storagePointer.js";
import { Storage } from "./storage.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";
import { ContentAccessor, contentTypeMap } from "./contentAccessor.js";

const nullTreeNodePointer = createNullPointer(treeNodeType);

export class TreeManager extends StorageAccessor {
    heapAllocator: HeapAllocator;
    
    constructor(storage: Storage, heapAllocator: HeapAllocator) {
        super();
        this.setStorage(storage);
        this.heapAllocator = heapAllocator;
    }
    
    async createTreeContentAccessor<T>(
        content: StoragePointer<TreeContent<T>>,
    ): Promise<ContentAccessor<T>> {
        const output = new ContentAccessor<T>();
        await output.init(this, content);
        return output;
    }
    
    async createNodeContentAccessor<T>(
        node: StoragePointer<TreeNode<T>>,
    ): Promise<ContentAccessor<T>> {
        const content = await this.readStructField(node, "treeContent");
        return await this.createTreeContentAccessor(content);
    }
    
    async findTreeItemByIndex<T>(
        root: StoragePointer<TreeRoot<T>>,
        index: number,
    ): Promise<TreeItem<T>> {
        let startIndex = 0;
        let node = await this.readStructField(root, "child");
        while (true) {
            const content = await this.readStructField(node, "treeContent");
            const itemCount = await this.readStructField(content, "itemCount");
            const leftChild = await this.readStructField(node, "leftChild");
            let leftIndex = startIndex;
            if (!leftChild.isNull()) {
                leftIndex += await this.readStructField(leftChild, "totalLength");
            }
            if (index >= leftIndex) {
                const rightIndex = leftIndex + itemCount;
                if (index < rightIndex) {
                    const accessor = await this.createTreeContentAccessor(content);
                    return { accessor, index: index - leftIndex };
                } else {
                    startIndex = rightIndex;
                    node = await this.readStructField(node, "rightChild");
                }
            } else {
                node = leftChild;
            }
        }
    }
    
    async iterateTreeContent<T>(
        node: StoragePointer<TreeNode<T>>,
        direction: TreeDirection,
        handle: (value: T) => Promise<boolean>,
    ): Promise<boolean> {
        const accessor = await this.createNodeContentAccessor(node);
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
    
    async iterateTreeHelper<T>(
        node: StoragePointer<TreeNode<T>>,
        direction: TreeDirection,
        handle: (value: T) => Promise<boolean>,
    ): Promise<boolean> {
        const previousChild = await this.readStructField(
            node,
            allocUtils.getOppositeChildKey(direction),
        );
        if (!previousChild.isNull()) {
            const result = await this.iterateTreeHelper(previousChild, direction, handle);
            if (result) {
                return true;
            }
        }
        const result = await this.iterateTreeContent(node, direction, handle);
        if (result) {
            return true;
        }
        const nextChild = await this.readStructField(
            node,
            allocUtils.getChildKey(direction),
        );
        if (nextChild.isNull()) {
            return false;
        } else {
            return await this.iterateTreeHelper(nextChild, direction, handle);
        }
    }
    
    async iterateTreeForward<T>(
        root: StoragePointer<TreeRoot<T>>,
        // When return value is true, iteration will stop early.
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.readStructField(root, "child");
        await this.iterateTreeHelper(node, TreeDirection.Forward, handle);
    }
    
    async iterateTreeBackward<T>(
        root: StoragePointer<TreeRoot<T>>,
        // When return value is true, iteration will stop early.
        handle: (value: T) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.readStructField(root, "child");
        await this.iterateTreeHelper(node, TreeDirection.Backward, handle);
    }
    
    async getFarthestChild<T>(
        node: StoragePointer<TreeNode<T>>,
        direction: TreeDirection,
    ): Promise<StoragePointer<TreeNode<T>>> {
        const childKey = allocUtils.getChildKey(direction);
        let output = node;
        while (true) {
            const child = await this.readStructField(output, childKey);
            if (child.isNull()) {
                break;
            }
            output = child;
        }
        return output;
    }
    
    async getNeighborTreeNode<T>(
        node: StoragePointer<TreeNode<T>>,
        direction: TreeDirection,
    ): Promise<StoragePointer<TreeNode<T>> | null> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const nextChild = await this.readStructField(node, childKey);
        if (nextChild.isNull()) {
            let child = node;
            while (true) {
                const parent = await this.readStructField(child, "parent");
                const allocType = await this.readStructField(parent, "type");
                if (allocType !== AllocType.Node) {
                    return null;
                }
                const parentNode = parent.convert(treeNodeType);
                const previousChild = await this.readStructField(
                    parentNode,
                    oppositeChildKey,
                );
                if (previousChild.index === child.index) {
                    return parentNode;
                }
                child = parentNode;
            }
        } else {
            const oppositeDirection = allocUtils.getOppositeDirection(direction);
            return await this.getFarthestChild(nextChild, oppositeDirection);
        }
    }
    
    async getNextTreeNode<T>(
        node: StoragePointer<TreeNode<T>>,
    ): Promise<StoragePointer<TreeNode<T>> | null> {
        return this.getNeighborTreeNode(node, TreeDirection.Forward);
    }
    
    async getPreviousTreeNode<T>(
        node: StoragePointer<TreeNode<T>>,
    ): Promise<StoragePointer<TreeNode<T>> | null> {
        return this.getNeighborTreeNode(node, TreeDirection.Backward);
    }
    
    async isFinalTreeNode(node: StoragePointer<TreeNode>): Promise<boolean> {
        return (await this.getNextTreeNode(node) === null);
    }
    
    async getFirstTreeNode<T>(
        root: StoragePointer<TreeRoot<T>>,
    ): Promise<StoragePointer<TreeNode<T>>> {
        const node = await this.readStructField(root, "child");
        return await this.getFarthestChild(node, TreeDirection.Backward);
    }
    
    // Returns the first item for which `compare` returns 0 or 1.
    async findTreeItemByComparison<T>(
        // Must be sorted by `compare`.
        root: StoragePointer<TreeRoot<T>>,
        // `compare` returns 0 if `value` has match, 1 if `value`
        // is too late, and -1 if `value` is too early.
        compare: (value: T) => Promise<number>,
    ): Promise<TreeItem<T>> {
        let node = await this.readStructField(root, "child");
        let startNode: StoragePointer<TreeNode<T>> = null;
        while (!node.isNull()) {
            const accessor = await this.createNodeContentAccessor(node);
            const value = await accessor.getItem(0);
            if (await compare(value) < 0) {
                startNode = node;
                node = await this.readStructField(node, "rightChild");
            } else {
                node = await this.readStructField(node, "leftChild");
            }
        }
        node = startNode;
        while (true) {
            const accessor = await this.createNodeContentAccessor(node);
            const itemCount = await accessor.getField("itemCount");
            // TODO: Use binary search.
            for (let index = 0; index < itemCount; index++) {
                const value = await accessor.getItem(index);
                if (await compare(value) >= 0) {
                    return { accessor, index };
                }
            }
            node = await this.getNextTreeNode(node);
        }
        return null;
    }
    
    async createTreeContent<T>(
        parent: StoragePointer<TreeNode<T>>,
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
            bufferLength,
            itemCount: values.length,
        });
        for (let index = 0; index < values.length; index++) {
            await this.writeTailElement(output, index, values[index]);
        }
        return output;
    }
    
    async createTreeNode<T>(
        contentAllocType: AllocType,
        bufferLength: number,
        values: T[],
    ): Promise<StoragePointer<TreeNode<T>>> {
        const output = (await this.heapAllocator.createAlloc(
            AllocType.Node,
            treeNodeType.getSize() - allocType.getSize(),
        )).convert(treeNodeType);
        const content = await this.createTreeContent(
            output,
            contentAllocType,
            bufferLength,
            values,
        );
        await this.writeStructFields(output, {
            leftChild: nullTreeNodePointer,
            rightChild: nullTreeNodePointer,
            maximumDepth: 1,
            totalLength: values.length,
            treeContent: content,
        });
        return output;
    }
    
    async getNodeChildField<T extends string & (keyof TreeNode)>(
        node: StoragePointer<TreeNode>,
        childKey: NodeChildKey,
        name: T,
        defaultValue: TreeNode[T],
    ): Promise<TreeNode[T]> {
        const child = await this.readStructField(node, childKey);
        return child.isNull() ? defaultValue : await this.readStructField(child, name);
    }
    
    async updateNodeMaximumDepth(node: StoragePointer<TreeNode>): Promise<void> {
        const depth1 = await this.getNodeChildField(node, "leftChild", "maximumDepth", 0);
        const depth2 = await this.getNodeChildField(node, "rightChild", "maximumDepth", 0);
        await this.writeStructField(node, "maximumDepth", Math.max(depth1, depth2) + 1);
    }
    
    async updateNodeTotalLength(node: StoragePointer<TreeNode>): Promise<void> {
        const length1 = await this.getNodeChildField(node, "leftChild", "totalLength", 0);
        const length2 = await this.getNodeChildField(node, "rightChild", "totalLength", 0);
        const content = await this.readStructField(node, "treeContent");
        const contentLength = await this.readStructField(content, "itemCount");
        await this.writeStructField(node, "totalLength", length1 + length2 + contentLength);
    }
    
    async updateNodeTotalLengths(startNode: StoragePointer<TreeNode>): Promise<void> {
        let node = startNode;
        while (node !== null) {
            await this.updateNodeTotalLength(node);
            node = await this.getParentNode(node);
        }
    }
    
    async updateTreeNodeMetrics(node: StoragePointer<TreeNode>): Promise<void> {
        await this.updateNodeMaximumDepth(node);
        await this.updateNodeTotalLength(node);
    }
    
    async setTreeRootChild<T>(
        root: StoragePointer<TreeRoot<T>>,
        child: StoragePointer<TreeNode<T>>,
    ): Promise<void> {
        await this.writeStructField(root, "child", child);
        if (!child.isNull()) {
            await this.writeStructField(child, "parent", root);
        }
    }
    
    async setTreeNodeChild<T>(
        parent: StoragePointer<TreeNode<T>>,
        childKey: NodeChildKey,
        child: StoragePointer<TreeNode<T>>,
    ): Promise<void> {
        await this.writeStructField(parent, childKey, child);
        if (!child.isNull()) {
            await this.writeStructField(child, "parent", parent);
        }
        await this.updateTreeNodeMetrics(parent);
    }
    
    async getNodeChildDepth(
        parent: StoragePointer<TreeNode>,
        childKey: NodeChildKey,
    ): Promise<number> {
        const child = await this.readStructField(parent, childKey);
        return child.isNull() ? 0 : await this.readStructField(child, "maximumDepth");
    }
    
    // A positive delta indicates that the child in `direction` has a greater depth.
    async getNodeDepthDelta(
        node: StoragePointer<TreeNode>,
        direction: TreeDirection,
    ): Promise<number> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const previousDepth = await this.getNodeChildDepth(node, oppositeChildKey);
        const nextDepth = await this.getNodeChildDepth(node, childKey);
        return nextDepth - previousDepth;
    }
    
    async replaceNodeChild<T>(
        parent: StoragePointer<TreeNode<T>>,
        oldChild: StoragePointer<TreeNode<T>>,
        newChild: StoragePointer<TreeNode<T>>,
    ): Promise<void> {
        let childKey: NodeChildKey = "leftChild";
        const child = await this.readStructField(parent, childKey);
        if (child.index !== oldChild.index) {
            childKey = "rightChild";
        }
        await this.setTreeNodeChild(parent, childKey, newChild);
    }
    
    async replaceChild<T>(
        parent: StoragePointer<Alloc>,
        oldChild: StoragePointer<TreeNode<T>>,
        newChild: StoragePointer<TreeNode<T>>,
    ): Promise<void> {
        const type = await this.readStructField(parent, "type");
        if (type === AllocType.Node) {
            const node = parent.convert(treeNodeType);
            await this.replaceNodeChild(node, oldChild, newChild);
        } else {
            const root = parent.convert(treeRootType);
            await this.setTreeRootChild(root, newChild);
        }
    }
    
    // The child of `node` in `direction` will swap places with `node`.
    async rotateTreeNode(
        node: StoragePointer<TreeNode>,
        direction: TreeDirection,
    ): Promise<void> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const parent = await this.readStructField(node, "parent");
        const child = await this.readStructField(node, childKey);
        const grandchild = await this.readStructField(child, oppositeChildKey);
        await this.setTreeNodeChild(node, childKey, grandchild);
        await this.setTreeNodeChild(child, oppositeChildKey, node);
        await this.replaceChild(parent, node, child);
    }
    
    // The child of `node` in `direction` is too deep.
    async balanceTreeNode(
        node: StoragePointer<TreeNode>,
        direction: TreeDirection,
    ): Promise<void> {
        const childKey = allocUtils.getChildKey(direction);
        const child = await this.readStructField(node, childKey);
        const depthDelta = await this.getNodeDepthDelta(child, direction);
        if (depthDelta < 0) {
            const oppositeDirection = allocUtils.getOppositeDirection(direction);
            await this.rotateTreeNode(child, oppositeDirection);
        }
        await this.rotateTreeNode(node, direction);
    }
    
    async getParentNode<T>(
        node: StoragePointer<TreeNode<T>>,
    ): Promise<StoragePointer<TreeNode<T>>> {
        const parent = await this.readStructField(node, "parent");
        const type = await this.readStructField(parent, "type");
        return (type === AllocType.Node) ? parent.convert(treeNodeType) : null;
    }
    
    async balanceTreeNodes(startNode: StoragePointer<TreeNode>): Promise<void> {
        let node = startNode;
        while (node !== null) {
            const parentNode = await this.getParentNode(node);
            await this.updateTreeNodeMetrics(node);
            const direction = TreeDirection.Forward;
            const depthDelta = await this.getNodeDepthDelta(node, direction);
            if (depthDelta > 1) {
                await this.balanceTreeNode(node, direction);
            } else if (depthDelta < -1) {
                const oppositeDirection = allocUtils.getOppositeDirection(direction);
                await this.balanceTreeNode(node, oppositeDirection);
            }
            node = parentNode;
        }
    }
    
    // `node` will be inserted before `nextNode` with respect to `direction`.
    async insertTreeNode<T>(
        node: StoragePointer<TreeNode<T>>,
        nextNode: StoragePointer<TreeNode<T>>,
        direction: TreeDirection,
    ): Promise<void> {
        const oppositeDirection = allocUtils.getOppositeDirection(direction);
        const oppositeChildKey = allocUtils.getChildKey(oppositeDirection);
        const previousChild = await this.readStructField(nextNode, oppositeChildKey);
        if (previousChild.isNull()) {
            await this.setTreeNodeChild(nextNode, oppositeChildKey, node);
        } else {
            const previousNode = await this.getNeighborTreeNode(nextNode, oppositeDirection);
            const childKey = allocUtils.getChildKey(direction);
            await this.setTreeNodeChild(previousNode, childKey, node);
        }
        await this.balanceTreeNodes(node);
    }
    
    async deleteTreeNode(node: StoragePointer<TreeNode>): Promise<void> {
        const parent = await this.readStructField(node, "parent");
        const leftChild = await this.readStructField(node, "leftChild");
        const rightChild = await this.readStructField(node, "rightChild");
        let replacementNode: StoragePointer<TreeNode>;
        let balanceStartNode: StoragePointer<TreeNode> = null;
        if (rightChild.isNull()) {
            replacementNode = leftChild;
        } else {
            replacementNode = await this.getFarthestChild(rightChild, TreeDirection.Backward);
            if (replacementNode.index !== rightChild.index) {
                const parent2 = await this.getParentNode(replacementNode);
                const rightChild2 = await this.readStructField(replacementNode, "rightChild");
                await this.setTreeNodeChild(parent2, "leftChild", rightChild2);
                await this.setTreeNodeChild(replacementNode, "rightChild", rightChild);
                balanceStartNode = parent2;
            }
            await this.setTreeNodeChild(replacementNode, "leftChild", leftChild);
        }
        if (balanceStartNode === null) {
            balanceStartNode = replacementNode;
        }
        await this.replaceChild(parent, node, replacementNode);
        await this.balanceTreeNodes(balanceStartNode);
        const content = await this.readStructField(node, "treeContent");
        await this.heapAllocator.deleteAlloc(content);
        await this.heapAllocator.deleteAlloc(node);
    }
    
    // `values` will be inserted before `nextItem`.
    async insertTreeItems<T>(values: T[], nextItem: TreeItem<T>): Promise<void> {
        const { accessor, index } = nextItem;
        let bufferLength = await accessor.getField("bufferLength");
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
        let bufferLength = await accessor.getField("bufferLength");
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
    async deleteTreeItems<T>(startItem: TreeItem<T>, endItem: TreeItem<T>): Promise<void> {
        const { accessor: startAccessor, index: startIndex } = startItem;
        const { accessor: endAccessor, index: endIndex } = endItem;
        const startNode = await startAccessor.getField("parent");
        const endNode = await endAccessor.getField("parent");
        // We iterate backward here, because `deleteItemsHelper` may borrow
        // items from the next node (but not the previous node).
        let node = endNode;
        while (node !== null) {
            const accessor = await this.createNodeContentAccessor(node);
            const itemCount = await accessor.getField("itemCount");
            let previousNode: StoragePointer<TreeNode<T>> | null;
            let tempStartIndex: number;
            if (node.index === startNode.index) {
                previousNode = null;
                tempStartIndex = startIndex;
            } else {
                previousNode = await this.getPreviousTreeNode(node);
                tempStartIndex = 0;
            }
            let tempEndIndex: number;
            if (node.index === endNode.index) {
                tempEndIndex = endIndex;
            } else {
                tempEndIndex = itemCount;
            }
            if (tempStartIndex <= 0 && tempEndIndex >= itemCount) {
                await this.deleteTreeNode(node);
            } else {
                await this.deleteItemsHelper(accessor, tempStartIndex, tempEndIndex);
            }
            node = previousNode;
        }
    }
}


