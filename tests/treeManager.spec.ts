
import { NodeChildKey } from "../src/internalTypes.js";
import { allocType, TreeRoot, treeRootType, TreeNode, treeNodeType } from "../src/builtTypes.js";
import { defaultContentSize, AllocType, TreeDirection } from "../src/constants.js";
import { MemoryStorage } from "../src/storage.js";
import { StoragePointer, createNullPointer } from "../src/storagePointer.js";
import { StorageAccessor } from "../src/storageAccessor.js";
import { HeapAllocator } from "../src/heapAllocator.js";
import { TreeManager } from "../src/treeManager.js";

interface TestContent {
    bufferLength: number;
    values: number[];
}

const nullNodePointer = createNullPointer(treeNodeType);

const createArray = (length: number, fillValue: number): number[] => (
    (new Array(length).fill(fillValue))
);

class TreeTester extends StorageAccessor {
    allocator: HeapAllocator;
    manager: TreeManager;
    nodes: StoragePointer<TreeNode<number>>[];
    root: StoragePointer<TreeRoot<number>>;
    
    async init(): Promise<void> {
        this.setStorage(new MemoryStorage());
        this.allocator = new HeapAllocator(this.storage);
        await this.allocator.createEmptyHeap();
        this.manager = new TreeManager(this.storage, this.allocator);
        this.root = (await this.allocator.createAlloc(
            AllocType.String,
            treeRootType.getSize() - allocType.getSize(),
        )).convert(treeRootType);
        this.nodes = [];
    }
    
    async initWithNodes(nodeAmount: number): Promise<void> {
        await this.init();
        while (this.nodes.length < nodeAmount) {
            const node = await this.manager.createTreeNode(AllocType.StringAsciiChars, 3, []);
            this.nodes.push(node);
        }
        await this.manager.setTreeRootChild(this.root, this.nodes[0]);
    }
    
    async initWithContents(contents: TestContent[]): Promise<void> {
        await this.init();
        for (let index = 0; index < contents.length; index++) {
            const content = contents[index];
            const node = await this.manager.createTreeNode(
                AllocType.StringAsciiChars,
                content.bufferLength,
                content.values,
            );
            this.nodes.push(node);
            if (index === 0) {
                await this.manager.setTreeRootChild(this.root, node);
            } else {
                await this.insertNode(index, index - 1, TreeDirection.Backward);
            }
        }
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
    
    async deleteNode(nodeIndex: number): Promise<void> {
        await this.manager.deleteTreeNode(this.nodes[nodeIndex]);
    }
    
    async insertItems(
        nodeIndex: number,
        contentIndex: number,
        values: number[],
    ): Promise<void> {
        const node = this.nodes[nodeIndex];
        const accessor = await this.manager.createNodeContentAccessor(node);
        const item = { accessor, index: contentIndex };
        await this.manager.insertTreeItems(values, item);
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
    
    async assertContents(contents: TestContent[]): Promise<void> {
        let index = 0;
        let node = await this.manager.getFirstTreeNode(this.root);
        while (node !== null) {
            expect(index).toBeLessThan(contents.length);
            const content = contents[index];
            const accessor = await this.manager.createNodeContentAccessor(node);
            const bufferLength = await accessor.getField("bufferLength");
            const values = await accessor.getAllItems();
            expect(bufferLength).toEqual(content.bufferLength);
            expect(values).toEqual(content.values);
            index += 1;
            node = await this.manager.getNextTreeNode(node);
        }
        expect(index).toEqual(contents.length);
    }
}

describe("TreeManager", () => {
    describe("insertTreeNode", () => {
        it("rotates left", async () => {
            const tester = new TreeTester();
            await tester.initWithNodes(3);
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
            await tester.initWithNodes(3);
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
            await tester.initWithNodes(3);
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
            await tester.initWithNodes(3);
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
    
    describe("deleteTreeNode", () => {
        it("deletes node which has no children", async () => {
            const tester = new TreeTester();
            await tester.initWithNodes(2);
            await tester.insertNode(1, 0, TreeDirection.Forward);
            await tester.deleteNode(1);
            await tester.assertRootChild(0);
            await tester.assertNodeChildren(0, null, null);
        });
        
        it("substitutes left child", async () => {
            const tester = new TreeTester();
            await tester.initWithNodes(2);
            await tester.insertNode(1, 0, TreeDirection.Forward);
            await tester.deleteNode(0);
            await tester.assertRootChild(1);
            await tester.assertNodeChildren(1, null, null);
        });
        
        it("substitutes right child", async () => {
            const tester = new TreeTester();
            await tester.initWithNodes(2);
            await tester.insertNode(1, 0, TreeDirection.Backward);
            await tester.deleteNode(0);
            await tester.assertRootChild(1);
            await tester.assertNodeChildren(1, null, null);
        });
        
        it("substitutes left child of right child", async () => {
            const tester = new TreeTester();
            await tester.initWithNodes(4);
            await tester.insertNode(1, 0, TreeDirection.Forward);
            await tester.insertNode(2, 0, TreeDirection.Backward);
            await tester.insertNode(3, 2, TreeDirection.Forward);
            await tester.deleteNode(0);
            await tester.assertRootChild(3);
            await tester.assertNodeChildren(3, 1, 2);
            await tester.assertNodeChildren(1, null, null);
            await tester.assertNodeChildren(2, null, null);
        });
        
        it("triggers node rotation", async () => {
            const tester = new TreeTester();
            await tester.initWithNodes(4);
            await tester.insertNode(1, 0, TreeDirection.Forward);
            await tester.insertNode(2, 0, TreeDirection.Backward);
            await tester.insertNode(3, 1, TreeDirection.Forward);
            await tester.deleteNode(0);
            await tester.assertRootChild(1);
            await tester.assertNodeChildren(1, 3, 2);
            await tester.assertNodeChildren(2, null, null);
            await tester.assertNodeChildren(3, null, null);
        });
    });
    
    describe("insertTreeItems", () => {
        it("works without any insertion", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                { bufferLength: 5, values: [10, 20, 30] },
                { bufferLength: 3, values: [40, 50, 60] },
            ]);
            await tester.assertContents([
                { bufferLength: 5, values: [10, 20, 30] },
                { bufferLength: 3, values: [40, 50, 60] },
            ]);
        });
        
        it("inserts without overflow", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                { bufferLength: 5, values: [10, 20, 30] },
            ]);
            await tester.insertItems(0, 2, [25, 26]);
            await tester.assertContents([
                { bufferLength: 5, values: [10, 20, 25, 26, 30] },
            ]);
        });
        
        it("inserts and resizes buffer", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                { bufferLength: 3, values: [10, 20, 30] },
            ]);
            await tester.insertItems(0, 2, [25, 26]);
            await tester.assertContents([
                { bufferLength: defaultContentSize, values: [10, 20, 25, 26, 30] },
            ]);
        });
        
        it("inserts into end of full final content", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
            ]);
            await tester.insertItems(0, defaultContentSize, [25, 26]);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
                {
                    bufferLength: defaultContentSize,
                    values: [25, 26],
                },
            ]);
        });
        
        it("inserts into end of non-full final content", async () => {
            const tester = new TreeTester();
            const initLength = defaultContentSize - 2;
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(initLength, 10),
                },
            ]);
            await tester.insertItems(0, initLength, [25, 26, 27, 28]);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(initLength, 10).concat([25, 26]),
                },
                {
                    bufferLength: defaultContentSize,
                    values: [27, 28],
                },
            ]);
        });
        it("inserts into middle of full final content", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
            ]);
            await tester.insertItems(0, 5, [25, 26]);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: [10, 10, 10, 10, 10, 25, 26].concat(
                        createArray(defaultContentSize - 7, 10),
                    ),
                },
                {
                    bufferLength: defaultContentSize,
                    values: [10, 10],
                },
            ]);
        });
        
        it("inserts into end of full non-final content", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
                {
                    bufferLength: 1,
                    values: [30],
                },
            ]);
            await tester.insertItems(0, defaultContentSize, [25, 26]);
            const targetLength = Math.ceil(defaultContentSize / 2);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(targetLength, 10),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize - targetLength, 10).concat(
                        [25, 26],
                    ),
                },
                {
                    bufferLength: 1,
                    values: [30],
                },
            ]);
        });
        
        it("inserts into middle of non-full non-final content", async () => {
            const tester = new TreeTester();
            const initLength = defaultContentSize - 2;
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(initLength, 10),
                },
                {
                    bufferLength: 1,
                    values: [30],
                },
            ]);
            await tester.insertItems(0, 5, [25, 26, 27, 28]);
            const targetLength = Math.ceil(defaultContentSize / 2);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: [10, 10, 10, 10, 10, 25, 26, 27, 28].concat(
                        createArray(targetLength - 9, 10),
                    ),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray((initLength - targetLength) + 4, 10),
                },
                {
                    bufferLength: 1,
                    values: [30],
                },
            ]);
        });
        
        it("inserts and shatters buffer", async () => {
            const tester = new TreeTester();
            const initLength = defaultContentSize * 3;
            const tenLength = Math.floor(initLength / 2);
            const thirtyLength = initLength - tenLength;
            await tester.initWithContents([
                {
                    bufferLength: initLength,
                    values: createArray(tenLength, 10).concat(
                        createArray(thirtyLength, 30),
                    ),
                },
            ]);
            await tester.insertItems(0, 5, [25, 26]);
            const marginLength = (tenLength - defaultContentSize) + 2;
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: [10, 10, 10, 10, 10, 25, 26].concat(
                        createArray(defaultContentSize - 7, 10),
                    ),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(marginLength, 10).concat(
                        createArray(defaultContentSize - marginLength, 30),
                    ),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 30),
                },
                {
                    bufferLength: defaultContentSize,
                    values: [30, 30],
                },
            ]);
        });
    });
});


