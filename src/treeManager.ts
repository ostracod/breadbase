
import { TreeItem, NodeChildKey, TreeNodeMetrics } from "./internalTypes.js";
import { AllocType, TreeDirection } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { StoragePointer, createNullPointer, getTailElementPointer } from "./storagePointer.js";
import { Alloc, allocType, TreeRoot, treeRootType, TreeNode, treeNodeType } from "./builtTypes.js";
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
    
    async findTreeItemByIndex(
        root: StoragePointer<TreeRoot>,
        index: number,
    ): Promise<TreeItem> {
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
                    startIndex = leftIndex;
                    break;
                } else {
                    startIndex = rightIndex;
                    node = await this.readStructField(node, "rightChild");
                }
            } else {
                node = leftChild;
            }
        }
        return {
            content: await this.readStructField(node, "treeContent"),
            index: index - startIndex,
        };
    }
    
    async iterateTreeContent(
        node: StoragePointer<TreeNode>,
        direction: TreeDirection,
        handle: (value: any) => Promise<boolean>,
    ): Promise<boolean> {
        const content = await this.readStructField(node, "treeContent");
        const accessor = new ContentAccessor();
        await accessor.init(this.storage, content);
        const itemCount = await accessor.getItemCount();
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
            const value = await accessor.readItem(index);
            const result = await handle(value);
            if (result) {
                return true;
            }
        }
        return false;
    }
    
    async iterateTreeHelper(
        node: StoragePointer<TreeNode>,
        direction: TreeDirection,
        handle: (value: any) => Promise<boolean>,
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
    
    async iterateTreeForward(
        root: StoragePointer<TreeRoot>,
        // When return value is true, iteration will stop early.
        handle: (value: any) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.readStructField(root, "child");
        await this.iterateTreeHelper(node, TreeDirection.Forward, handle);
    }
    
    async iterateTreeBackward(
        root: StoragePointer<TreeRoot>,
        // When return value is true, iteration will stop early.
        handle: (value: any) => Promise<boolean>,
    ): Promise<void> {
        const node = await this.readStructField(root, "child");
        await this.iterateTreeHelper(node, TreeDirection.Backward, handle);
    }
    
    async getNeighborTreeNode(
        node: StoragePointer<TreeNode>,
        direction: TreeDirection,
    ): Promise<StoragePointer<TreeNode>> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const nextChild = await this.readStructField(node, childKey);
        if (nextChild.isNull()) {
            let child = node;
            while (true) {
                const parent = await this.readStructField(node, "parent");
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
            let output = nextChild;
            while (true) {
                const previousChild = await this.readStructField(output, oppositeChildKey);
                if (previousChild.isNull()) {
                    return output;
                }
                output = previousChild;
            }
        }
    }
    
    async getNextTreeNode(node: StoragePointer<TreeNode>): Promise<StoragePointer<TreeNode>> {
        return this.getNeighborTreeNode(node, TreeDirection.Forward);
    }
    
    async getPreviousTreeNode(
        node: StoragePointer<TreeNode>,
    ): Promise<StoragePointer<TreeNode>> {
        return this.getNeighborTreeNode(node, TreeDirection.Backward);
    }
    
    // Returns the first item for which `compare` returns 0 or 1.
    async findTreeItemByComparison(
        // Must be sorted by `compare`.
        root: StoragePointer<TreeRoot>,
        // `compare` returns 0 if `value` has match, 1 if `value`
        // is too late, and -1 if `value` is too early.
        compare: (value: any) => Promise<number>,
    ): Promise<TreeItem> {
        let node = await this.readStructField(root, "child");
        let startNode: StoragePointer<TreeNode> = null;
        while (!node.isNull()) {
            const content = await this.readStructField(node, "treeContent");
            const accessor = new ContentAccessor();
            await accessor.init(this.storage, content);
            const value = await accessor.readItem(0);
            if (await compare(value) < 0) {
                startNode = node;
                node = await this.readStructField(node, "rightChild");
            } else {
                node = await this.readStructField(node, "leftChild");
            }
        }
        node = startNode;
        while (true) {
            const content = await this.readStructField(node, "treeContent");
            const accessor = new ContentAccessor();
            await accessor.init(this.storage, content);
            const itemCount = await accessor.getItemCount();
            // TODO: Use binary search.
            for (let index = 0; index < itemCount; index++) {
                const value = await accessor.readItem(index);
                if (await compare(value) >= 0) {
                    return { content, index };
                }
            }
            node = await this.getNextTreeNode(node);
        }
        return null;
    }
    
    async createTreeNode(
        contentAllocType: AllocType,
        bufferLength: number,
        values: any[],
    ): Promise<StoragePointer<TreeNode>> {
        const output = (await this.heapAllocator.createAlloc(
            AllocType.Node,
            treeNodeType.getSize() - allocType.getSize(),
        )).convert(treeNodeType);
        const contentType = contentTypeMap.get(contentAllocType);
        const content = (await this.heapAllocator.createAlloc(
            contentAllocType,
            contentType.getSizeWithTail(bufferLength) - allocType.getSize(),
        )).convert(contentType);
        await this.writeStructFields(content, {
            bufferLength,
            itemCount: values.length,
        });
        for (let index = 0; index < values.length; index++) {
            await this.write(getTailElementPointer(content, index), values[index]);
        }
        await this.writeStructFields(output, {
            leftChild: nullTreeNodePointer,
            rightChild: nullTreeNodePointer,
            maximumDepth: 1,
            totalLength: values.length,
            treeContent: content,
        });
        await this.writeStructField(output, "treeContent", content);
        return output;
    }
    
    async getTreeNodeMetrics(node: StoragePointer<TreeNode>): Promise<TreeNodeMetrics> {
        if (node.isNull()) {
            return { depth: 0, length: 0 };
        }
        return {
            length: await this.readStructField(node, "totalLength"),
            depth: await this.readStructField(node, "maximumDepth"),
        };
    }
    
    async updateTreeNodeMetrics(node: StoragePointer<TreeNode>): Promise<void> {
        const leftChild = await this.readStructField(node, "leftChild");
        const leftMetrics = await this.getTreeNodeMetrics(leftChild);
        const rightChild = await this.readStructField(node, "rightChild");
        const rightMetrics = await this.getTreeNodeMetrics(rightChild);
        const content = await this.readStructField(node, "treeContent");
        const contentLength = await this.readStructField(content, "itemCount");
        await this.writeStructFields(node, {
            maximumDepth: Math.max(leftMetrics.depth, rightMetrics.depth) + 1,
            totalLength: leftMetrics.length + rightMetrics.length + contentLength,
        });
    }
    
    async setTreeRootChild(
        root: StoragePointer<TreeRoot>,
        child: StoragePointer<TreeNode>,
    ): Promise<void> {
        await this.writeStructField(root, "child", child);
        if (!child.isNull()) {
            await this.writeStructField(child, "parent", root);
        }
    }
    
    async setTreeNodeChild(
        parent: StoragePointer<TreeNode>,
        childKey: NodeChildKey,
        child: StoragePointer<TreeNode>,
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
    
    async replaceChild(
        parent: StoragePointer<Alloc>,
        oldChild: StoragePointer<TreeNode>,
        newChild: StoragePointer<TreeNode>,
    ): Promise<void> {
        const type = await this.readStructField(parent, "type");
        if (type === AllocType.Node) {
            const node = parent.convert(treeNodeType);
            let childKey: NodeChildKey = "leftChild";
            const child = await this.readStructField(node, childKey);
            if (child.index !== oldChild.index) {
                childKey = "rightChild";
            }
            await this.setTreeNodeChild(node, childKey, newChild);
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
    
    async balanceTreeNodes(startNode: StoragePointer<TreeNode>): Promise<void> {
        let node = startNode;
        while (node !== null) {
            const parent = await this.readStructField(node, "parent");
            const type = await this.readStructField(parent, "type");
            let parentNode: StoragePointer<TreeNode>;
            if (type === AllocType.Node) {
                parentNode = parent.convert(treeNodeType);
            } else {
                parentNode = null;
            }
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
    async insertTreeNode(
        node: StoragePointer<TreeNode>,
        nextNode: StoragePointer<TreeNode>,
        direction: TreeDirection,
    ): Promise<void> {
        const oppositeDirection = allocUtils.getOppositeDirection(direction);
        const oppositeChildKey = allocUtils.getChildKey(oppositeDirection);
        const previousChild = await this.readStructField(nextNode, oppositeChildKey);
        if (previousChild.isNull()) {
            await this.setTreeNodeChild(nextNode, oppositeChildKey, node);
        } else {
            const previousNode = await this.getNeighborTreeNode(node, oppositeDirection);
            const childKey = allocUtils.getChildKey(direction);
            await this.setTreeNodeChild(previousNode, childKey, node);
        }
        await this.balanceTreeNodes(node);
    }
    
    async deleteTreeNode(node: StoragePointer<TreeNode>): Promise<void> {
        // TODO: Implement.
        
    }
    
    // `values` will be inserted before `nextItem`.
    async insertTreeItems(values: any[], nextItem: TreeItem): Promise<void> {
        // TODO: Implement.
        
    }
    
    async deleteTreeItem(item: TreeItem): Promise<void> {
        // TODO: Implement.
        
    }
}


