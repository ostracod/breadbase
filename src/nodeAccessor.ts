
import { NodeChildKey } from "./internalTypes.js";
import { Alloc, TreeRoot, treeRootType, TreeBranches, ContentNode, contentNodeType } from "./builtTypes.js";
import { DataType } from "./dataType.js";
import { AllocType, TreeDirection } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { Storage } from "./storage.js";
import { StoragePointer, getStructFieldPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";

export abstract class NodeAccessor<T extends Alloc> extends StorageAccessor {
    
    constructor(storage: Storage) {
        super();
        this.setStorage(storage);
    }
    
    abstract getNodeAllocType(): AllocType;
    
    abstract getNodeDataType(): DataType<T>;
    
    abstract getBranches(node: StoragePointer<T>): StoragePointer<TreeBranches<T>>;
    
    abstract getNodeLength(node: StoragePointer<T>): Promise<number>;
    
    async readBranchesField<T2 extends string & (keyof TreeBranches)>(
        node: StoragePointer<T>,
        name: T2,
    ): Promise<TreeBranches<T>[T2]> {
        return await this.readStructField(this.getBranches(node), name);
    }
    
    async writeBranchesField<T2 extends string & (keyof TreeBranches)>(
        node: StoragePointer<T>,
        name: T2,
        value: TreeBranches<T>[T2],
    ): Promise<void> {
        return await this.writeStructField(this.getBranches(node), name, value);
    }
    
    async getFarthestChild(
        node: StoragePointer<T>,
        direction: TreeDirection,
    ): Promise<StoragePointer<T>> {
        const childKey = allocUtils.getChildKey(direction);
        let output = node;
        while (true) {
            const child = await this.readBranchesField(output, childKey);
            if (child.isNull()) {
                break;
            }
            output = child;
        }
        return output;
    }
    
    async getNeighborNode(
        node: StoragePointer<T>,
        direction: TreeDirection,
    ): Promise<StoragePointer<T> | null> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const nextChild = await this.readBranchesField(node, childKey);
        if (nextChild.isNull()) {
            let child = node;
            while (true) {
                const parent = await this.readBranchesField(child, "parent");
                const allocType = await this.readStructField(parent, "type");
                if (allocType !== this.getNodeAllocType()) {
                    return null;
                }
                const parentNode = parent.convert(this.getNodeDataType());
                const previousChild = await this.readBranchesField(
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
    
    async getNextNode(
        node: StoragePointer<T>,
    ): Promise<StoragePointer<T> | null> {
        return this.getNeighborNode(node, TreeDirection.Forward);
    }
    
    async getPreviousNode(
        node: StoragePointer<T>,
    ): Promise<StoragePointer<T> | null> {
        return this.getNeighborNode(node, TreeDirection.Backward);
    }
    
    async isFinalNode(node: StoragePointer<T>): Promise<boolean> {
        return (await this.getNextNode(node) === null);
    }
    
    async getFirstNode(
        root: StoragePointer<TreeRoot<T>>,
    ): Promise<StoragePointer<T>> {
        const node = await this.readStructField(root, "child");
        return await this.getFarthestChild(node, TreeDirection.Backward);
    }
    
    async readChildBranchesField<T2 extends string & (keyof TreeBranches)>(
        node: StoragePointer<T>,
        childKey: NodeChildKey,
        name: T2,
        defaultValue: TreeBranches<T>[T2],
    ): Promise<TreeBranches<T>[T2]> {
        const child = await this.readBranchesField(node, childKey);
        return child.isNull() ? defaultValue : await this.readBranchesField(child, name);
    }
    
    async updateNodeMaximumDepth(node: StoragePointer<T>): Promise<void> {
        const depth1 = await this.readChildBranchesField(
            node, "leftChild", "maximumDepth", 0,
        );
        const depth2 = await this.readChildBranchesField(
            node, "rightChild", "maximumDepth", 0,
        );
        await this.writeBranchesField(node, "maximumDepth", Math.max(depth1, depth2) + 1);
    }
    
    async updateNodeTotalLength(node: StoragePointer<T>): Promise<void> {
        const length1 = await this.readChildBranchesField(
            node, "leftChild", "totalLength", 0,
        );
        const length2 = await this.readChildBranchesField(
            node, "rightChild", "totalLength", 0,
        );
        const nodeLength = await this.getNodeLength(node);
        await this.writeBranchesField(node, "totalLength", length1 + length2 + nodeLength);
    }
    
    async updateNodeTotalLengths(startNode: StoragePointer<T>): Promise<void> {
        let node = startNode;
        while (node !== null) {
            await this.updateNodeTotalLength(node);
            node = await this.getParentNode(node);
        }
    }
    
    async updateNodeMetrics(node: StoragePointer<T>): Promise<void> {
        await this.updateNodeMaximumDepth(node);
        await this.updateNodeTotalLength(node);
    }
    
    async setRootChild(
        root: StoragePointer<TreeRoot<T>>,
        child: StoragePointer<T>,
    ): Promise<void> {
        await this.writeStructField(root, "child", child);
        if (!child.isNull()) {
            await this.writeBranchesField(child, "parent", root);
        }
    }
    
    async setNodeChild(
        parent: StoragePointer<T>,
        childKey: NodeChildKey,
        child: StoragePointer<T>,
    ): Promise<void> {
        await this.writeBranchesField(parent, childKey, child);
        if (!child.isNull()) {
            await this.writeBranchesField(child, "parent", parent);
        }
        await this.updateNodeMetrics(parent);
    }
    
    async getNodeChildDepth(
        parent: StoragePointer<T>,
        childKey: NodeChildKey,
    ): Promise<number> {
        const child = await this.readBranchesField(parent, childKey);
        return child.isNull() ? 0 : await this.readBranchesField(child, "maximumDepth");
    }
    
    // A positive delta indicates that the child in `direction` has a greater depth.
    async getNodeDepthDelta(
        node: StoragePointer<T>,
        direction: TreeDirection,
    ): Promise<number> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const previousDepth = await this.getNodeChildDepth(node, oppositeChildKey);
        const nextDepth = await this.getNodeChildDepth(node, childKey);
        return nextDepth - previousDepth;
    }
    
    async replaceNodeChild(
        parent: StoragePointer<T>,
        oldChild: StoragePointer<T>,
        newChild: StoragePointer<T>,
    ): Promise<void> {
        let childKey: NodeChildKey = "leftChild";
        const child = await this.readBranchesField(parent, childKey);
        if (child.index !== oldChild.index) {
            childKey = "rightChild";
        }
        await this.setNodeChild(parent, childKey, newChild);
    }
    
    async replaceChild(
        parent: StoragePointer<Alloc>,
        oldChild: StoragePointer<T>,
        newChild: StoragePointer<T>,
    ): Promise<void> {
        const type = await this.readStructField(parent, "type");
        if (type === this.getNodeAllocType()) {
            const node = parent.convert(this.getNodeDataType());
            await this.replaceNodeChild(node, oldChild, newChild);
        } else {
            const root = parent.convert(treeRootType);
            await this.setRootChild(root, newChild);
        }
    }
    
    // The child of `node` in `direction` will swap places with `node`.
    async rotateTreeNode(
        node: StoragePointer<T>,
        direction: TreeDirection,
    ): Promise<void> {
        const { childKey, oppositeChildKey } = allocUtils.getChildKeys(direction);
        const parent = await this.readBranchesField(node, "parent");
        const child = await this.readBranchesField(node, childKey);
        const grandchild = await this.readBranchesField(child, oppositeChildKey);
        await this.setNodeChild(node, childKey, grandchild);
        await this.setNodeChild(child, oppositeChildKey, node);
        await this.replaceChild(parent, node, child);
    }
    
    // The child of `node` in `direction` is too deep.
    async balanceTreeNode(
        node: StoragePointer<T>,
        direction: TreeDirection,
    ): Promise<void> {
        const childKey = allocUtils.getChildKey(direction);
        const child = await this.readBranchesField(node, childKey);
        const depthDelta = await this.getNodeDepthDelta(child, direction);
        if (depthDelta < 0) {
            const oppositeDirection = allocUtils.getOppositeDirection(direction);
            await this.rotateTreeNode(child, oppositeDirection);
        }
        await this.rotateTreeNode(node, direction);
    }
    
    async getParentNode(
        node: StoragePointer<T>,
    ): Promise<StoragePointer<T>> {
        const parent = await this.readBranchesField(node, "parent");
        const type = await this.readStructField(parent, "type");
        if (type === this.getNodeAllocType()) {
            return parent.convert(this.getNodeDataType());
        } else {
            return null;
        }
    }
    
    async balanceNodes(startNode: StoragePointer<T>): Promise<void> {
        let node = startNode;
        while (node !== null) {
            const parentNode = await this.getParentNode(node);
            await this.updateNodeMetrics(node);
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
    async insertNode(
        node: StoragePointer<T>,
        nextNode: StoragePointer<T>,
        direction: TreeDirection,
    ): Promise<void> {
        const oppositeDirection = allocUtils.getOppositeDirection(direction);
        const oppositeChildKey = allocUtils.getChildKey(oppositeDirection);
        const previousChild = await this.readBranchesField(nextNode, oppositeChildKey);
        if (previousChild.isNull()) {
            await this.setNodeChild(nextNode, oppositeChildKey, node);
        } else {
            const previousNode = await this.getNeighborNode(nextNode, oppositeDirection);
            const childKey = allocUtils.getChildKey(direction);
            await this.setNodeChild(previousNode, childKey, node);
        }
        await this.balanceNodes(node);
    }
    
    async removeNode(node: StoragePointer<T>): Promise<void> {
        const parent = await this.readBranchesField(node, "parent");
        const leftChild = await this.readBranchesField(node, "leftChild");
        const rightChild = await this.readBranchesField(node, "rightChild");
        let replacementNode: StoragePointer<T>;
        let balanceStartNode: StoragePointer<T> = null;
        if (rightChild.isNull()) {
            replacementNode = leftChild;
        } else {
            replacementNode = await this.getFarthestChild(rightChild, TreeDirection.Backward);
            if (replacementNode.index !== rightChild.index) {
                const parent2 = await this.getParentNode(replacementNode);
                const rightChild2 = await this.readBranchesField(
                    replacementNode,
                    "rightChild",
                );
                await this.setNodeChild(parent2, "leftChild", rightChild2);
                await this.setNodeChild(replacementNode, "rightChild", rightChild);
                balanceStartNode = parent2;
            }
            await this.setNodeChild(replacementNode, "leftChild", leftChild);
        }
        if (balanceStartNode === null) {
            balanceStartNode = replacementNode;
        }
        await this.replaceChild(parent, node, replacementNode);
        await this.balanceNodes(balanceStartNode);
    }
}

export class ContentNodeAccessor<T> extends NodeAccessor<ContentNode<T>> {
    
    getNodeAllocType(): AllocType {
        return AllocType.ContentNode;
    }
    
    getNodeDataType(): DataType<ContentNode<T>> {
        return contentNodeType;
    }
    
    getBranches(
        node: StoragePointer<ContentNode<T>>,
    ): StoragePointer<TreeBranches<ContentNode<T>>> {
        return getStructFieldPointer(node, "branches");
    }
    
    async getNodeLength(node: StoragePointer<ContentNode<T>>): Promise<number> {
        const content = await this.readStructField(node, "treeContent");
        return await this.readStructField(content, "itemCount");
    }
}


