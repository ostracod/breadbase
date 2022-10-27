
import { NodeChildKey } from "../src/internalTypes.js";
import { allocType, TreeRoot, treeRootType, TreeNode, treeNodeType } from "../src/builtTypes.js";
import { AllocType, TreeDirection } from "../src/constants.js";
import { MemoryStorage } from "../src/storage.js";
import { StoragePointer, createNullPointer } from "../src/storagePointer.js";
import { StorageAccessor } from "../src/storageAccessor.js";
import { HeapAllocator } from "../src/heapAllocator.js";
import { TreeManager } from "../src/treeManager.js";

const nullNodePointer = createNullPointer(treeNodeType);

class TreeTester extends StorageAccessor {
    allocator: HeapAllocator;
    manager: TreeManager;
    nodes: StoragePointer<TreeNode>[];
    root: StoragePointer<TreeRoot>;
    
    async init(nodeAmount: number): Promise<void> {
        this.setStorage(new MemoryStorage());
        this.allocator = new HeapAllocator(this.storage);
        await this.allocator.createEmptyHeap();
        this.manager = new TreeManager(this.storage, this.allocator);
        this.nodes = [];
        while (this.nodes.length < nodeAmount) {
            const node = await this.manager.createTreeNode(AllocType.StringAsciiChars, 3, []);
            this.nodes.push(node);
        }
        this.root = (await this.allocator.createAlloc(
            AllocType.String,
            treeRootType.getSize() - allocType.getSize(),
        )).convert(treeRootType);
        await this.manager.setTreeRootChild(this.root, this.nodes[0]);
    }
    
    async insertNode(
        nodeIndex: number,
        nextNodeIndex: number,
        direction: TreeDirection,
    ): Promise<void> {
        await this.manager.insertTreeNode(
            this.nodes[nodeIndex],
            this.nodes[nextNodeIndex],
            direction,
        );
    }
    
    async assertRootChild(childIndex: number): Promise<void> {
        const child = (childIndex === null) ? nullNodePointer : this.nodes[childIndex];
        expect(
            (await this.readStructField(this.root, "child")).index,
        ).toEqual(child.index);
        if (!child.isNull()) {
            expect(
                (await this.readStructField(child, "parent")).index,
            ).toEqual(this.root.index);
        }
    }
    
    async assertNodeChild(
        nodeIndex: number,
        childKey: NodeChildKey,
        childIndex: number,
    ): Promise<void> {
        const node = this.nodes[nodeIndex];
        const child = (childIndex === null) ? nullNodePointer : this.nodes[childIndex];
        expect(
            (await this.readStructField(node, childKey)).index,
        ).toEqual(child.index);
        if (!child.isNull()) {
            expect(
                (await this.readStructField(child, "parent")).index,
            ).toEqual(node.index);
        }
    }
    
    async assertNodeChildren(
        nodeIndex: number,
        leftChildIndex: number,
        rightChildIndex: number,
    ): Promise<void> {
        await this.assertNodeChild(nodeIndex, "leftChild", leftChildIndex);
        await this.assertNodeChild(nodeIndex, "rightChild", rightChildIndex);
    }
}

describe("TreeManager", () => {
    describe("insertTreeNode", () => {
        it("rotates left", async () => {
            const tester = new TreeTester();
            await tester.init(3);
            await tester.insertNode(1, 0, TreeDirection.Forward);
            await tester.assertRootChild(0);
            await tester.assertNodeChildren(0, 1, null);
            await tester.insertNode(2, 1, TreeDirection.Forward);
            await tester.assertRootChild(1);
            await tester.assertNodeChildren(0, null, null);
            await tester.assertNodeChildren(1, 2, 0);
            await tester.assertNodeChildren(2, null, null);
        });
        
        it("rotates right", async () => {
            const tester = new TreeTester();
            await tester.init(3);
            await tester.insertNode(1, 0, TreeDirection.Backward);
            await tester.assertRootChild(0);
            await tester.assertNodeChildren(0, null, 1);
            await tester.insertNode(2, 1, TreeDirection.Backward);
            await tester.assertRootChild(1);
            await tester.assertNodeChildren(0, null, null);
            await tester.assertNodeChildren(1, 0, 2);
            await tester.assertNodeChildren(2, null, null);
        });
        
        it("rotates right then left", async () => {
            const tester = new TreeTester();
            await tester.init(3);
            await tester.insertNode(1, 0, TreeDirection.Forward);
            await tester.assertRootChild(0);
            await tester.assertNodeChildren(0, 1, null);
            await tester.insertNode(2, 1, TreeDirection.Backward);
            await tester.assertRootChild(2);
            await tester.assertNodeChildren(0, null, null);
            await tester.assertNodeChildren(2, 1, 0);
            await tester.assertNodeChildren(1, null, null);
        });
        
        it("rotates left then right", async () => {
            const tester = new TreeTester();
            await tester.init(3);
            await tester.insertNode(1, 0, TreeDirection.Backward);
            await tester.assertRootChild(0);
            await tester.assertNodeChildren(0, null, 1);
            await tester.insertNode(2, 1, TreeDirection.Forward);
            await tester.assertRootChild(2);
            await tester.assertNodeChildren(0, null, null);
            await tester.assertNodeChildren(2, 0, 1);
            await tester.assertNodeChildren(1, null, null);
        });
    });
});


