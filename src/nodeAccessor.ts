
import { Alloc, TreeRoot, TreeBranches, ContentNode, contentNodeType } from "./builtTypes.js";
import { DataType } from "./dataType.js";
import { AllocType, TreeDirection } from "./constants.js";
import * as allocUtils from "./allocUtils.js";
import { StoragePointer, getStructFieldPointer } from "./storagePointer.js";
import { StorageAccessor } from "./storageAccessor.js";
import { HeapAllocator } from "./heapAllocator.js";

export abstract class NodeAccessor<T extends Alloc> extends StorageAccessor {
    heapAllocator: HeapAllocator;
    
    constructor(heapAllocator: HeapAllocator) {
        super();
        this.heapAllocator = heapAllocator;
        this.setStorage(this.heapAllocator.storage);
    }
    
    abstract getNodeAllocType(): AllocType;
    
    abstract getNodeDataType(): DataType<T>;
    
    abstract getBranches(node: StoragePointer<T>): StoragePointer<TreeBranches<T>>;
    
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
}


