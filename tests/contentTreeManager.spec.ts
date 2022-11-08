
import { ContentItem, NodeChildKey } from "../src/internalTypes.js";
import { allocType, ContentRoot, contentRootType, ContentNode, contentNodeType } from "../src/builtTypes.js";
import { defaultContentSize, AllocType, TreeDirection } from "../src/constants.js";
import { MemoryStorage } from "../src/storage.js";
import { StoragePointer, createNullPointer } from "../src/storagePointer.js";
import { StorageAccessor } from "../src/storageAccessor.js";
import { HeapAllocator } from "../src/heapAllocator.js";
import { ContentTreeManager } from "../src/contentTreeManager.js";
import { ContentNodeAccessor } from "../src/nodeAccessor.js";

interface TestContent {
    bufferLength: number;
    values: number[];
}

const nullNodePointer = createNullPointer(contentNodeType);

const createArray = (length: number, fillValue: number): number[] => (
    (new Array(length).fill(fillValue))
);

class TreeTester extends StorageAccessor {
    allocator: HeapAllocator;
    manager: ContentTreeManager<number>;
    nodeAccessor: ContentNodeAccessor<number>;
    nodes: StoragePointer<ContentNode<number>>[];
    root: StoragePointer<ContentRoot<number>>;
    
    async init(): Promise<void> {
        this.setStorage(new MemoryStorage());
        this.allocator = new HeapAllocator(this.storage);
        await this.allocator.createEmptyHeap();
        this.root = (await this.allocator.createAlloc(
            AllocType.AsciiStringRoot,
            contentRootType.getSize() - allocType.getSize(),
        )).convert(contentRootType);
        this.manager = new ContentTreeManager(this.allocator, this.root);
        this.nodeAccessor = this.manager.nodeAccessor;
        this.nodes = [];
    }
    
    async initWithNodes(nodeAmount: number): Promise<void> {
        await this.init();
        while (this.nodes.length < nodeAmount) {
            const node = await this.manager.createNode(AllocType.AsciiStringContent, 3, []);
            this.nodes.push(node);
        }
        await this.nodeAccessor.setRootChild(this.root, this.nodes[0]);
    }
    
    async initWithContents(contents: TestContent[]): Promise<void> {
        await this.init();
        for (let index = 0; index < contents.length; index++) {
            const content = contents[index];
            const node = await this.manager.createNode(
                AllocType.AsciiStringContent,
                content.bufferLength,
                content.values,
            );
            this.nodes.push(node);
            if (index === 0) {
                await this.nodeAccessor.setRootChild(this.root, node);
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
        await this.nodeAccessor.insertNode(
            this.nodes[nodeIndex],
            this.nodes[nextNodeIndex],
            direction,
        );
    }
    
    async deleteNode(nodeIndex: number): Promise<void> {
        await this.manager.deleteNode(this.nodes[nodeIndex]);
    }
    
    async createItem(
        nodeIndex: number,
        contentIndex: number,
    ): Promise<ContentItem<number>> {
        const node = this.nodes[nodeIndex];
        const accessor = await this.manager.createContentAccessorByNode(node);
        return { accessor, index: contentIndex };
    }
    
    async insertItems(
        nodeIndex: number,
        contentIndex: number,
        values: number[],
    ): Promise<void> {
        const item = await this.createItem(nodeIndex, contentIndex);
        await this.manager.insertItems(values, item);
    }
    
    async deleteItems(
        startNodeIndex: number,
        startContentIndex: number,
        endNodeIndex: number,
        endContentIndex: number,
    ): Promise<void> {
        const startItem = await this.createItem(startNodeIndex, startContentIndex);
        const endItem = await this.createItem(endNodeIndex, endContentIndex);
        await this.manager.deleteItems(startItem, endItem);
    }
    
    async assertRootChild(childIndex: number): Promise<void> {
        const child = (childIndex === null) ? nullNodePointer : this.nodes[childIndex];
        expect(
            (await this.readStructField(this.root, "child")).index,
        ).toEqual(child.index);
        if (!child.isNull()) {
            expect(
                (await this.nodeAccessor.readBranchesField(child, "parent")).index,
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
            (await this.nodeAccessor.readBranchesField(node, childKey)).index,
        ).toEqual(child.index);
        if (!child.isNull()) {
            expect(
                (await this.nodeAccessor.readBranchesField(child, "parent")).index,
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
        let node = await this.nodeAccessor.getFirstNode(this.root);
        while (node !== null) {
            expect(index).toBeLessThan(contents.length);
            const content = contents[index];
            const accessor = await this.manager.createContentAccessorByNode(node);
            const bufferLength = await accessor.getBufferLength();
            const values = await accessor.getAllItems();
            expect(bufferLength).toEqual(content.bufferLength);
            expect(values).toEqual(content.values);
            index += 1;
            node = await this.nodeAccessor.getNextNode(node);
        }
        expect(index).toEqual(contents.length);
    }
}

describe("ContentTreeManager", () => {
    describe("insertNode", () => {
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
    
    describe("deleteNode", () => {
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
    
    describe("insertItems", () => {
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
    
    describe("deleteItems", () => {
        it("deletes without borrow", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: 7,
                    values: [10, 11, 12, 13, 14, 15, 16],
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
            ]);
            await tester.deleteItems(0, 3, 0, 5);
            await tester.assertContents([
                {
                    bufferLength: 7,
                    values: [10, 11, 12, 15, 16],
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
            ]);
        });
        
        it("deletes across multiple nodes", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: 5,
                    values: [10, 11, 12, 13, 14],
                },
                {
                    bufferLength: 3,
                    values: [20, 21, 22],
                },
                {
                    bufferLength: 5,
                    values: [30, 31, 32, 33, 34],
                },
            ]);
            await tester.deleteItems(0, 4, 2, 1);
            await tester.assertContents([
                {
                    bufferLength: 5,
                    values: [10, 11, 12, 13],
                },
                {
                    bufferLength: 5,
                    values: [31, 32, 33, 34],
                },
            ]);
        });
        
        it("deletes and shatters buffer", async () => {
            const tester = new TreeTester();
            const initLength = defaultContentSize * 3;
            await tester.initWithContents([
                {
                    bufferLength: initLength,
                    values: createArray(initLength, 10),
                },
            ]);
            await tester.deleteItems(0, 5, 0, 7);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 10),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize - 2, 10),
                },
            ]);
        });
        
        it("deletes and resizes buffer", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize * 5,
                    values: createArray(defaultContentSize, 10),
                },
            ]);
            const nextLength = defaultContentSize - 2;
            await tester.deleteItems(0, nextLength, 0, defaultContentSize);
            await tester.assertContents([
                {
                    bufferLength: nextLength * 2,
                    values: createArray(nextLength, 10),
                },
            ]);
        });
        
        it("borrows and deletes next node", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: defaultContentSize,
                    values: [10, 11, 12],
                },
                {
                    bufferLength: defaultContentSize,
                    values: [20, 21],
                },
            ]);
            await tester.deleteItems(0, 1, 0, 2);
            await tester.assertContents([
                {
                    bufferLength: defaultContentSize,
                    values: [10, 12, 20, 21],
                },
            ]);
        });
        
        it("does not borrow if next node is starved", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: 16,
                    values: [10, 11, 12, 13],
                },
                {
                    bufferLength: defaultContentSize,
                    values: [20, 21, 22, 23, 24, 25],
                },
            ]);
            await tester.deleteItems(0, 1, 0, 2);
            await tester.assertContents([
                {
                    bufferLength: 16,
                    values: [10, 12, 13],
                },
                {
                    bufferLength: defaultContentSize,
                    values: [20, 21, 22, 23, 24, 25],
                },
            ]);
        });
        
        it("borrows from next node", async () => {
            const tester = new TreeTester();
            await tester.initWithContents([
                {
                    bufferLength: 16,
                    values: [10, 11, 12, 13],
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 20),
                },
            ]);
            await tester.deleteItems(0, 1, 0, 2);
            await tester.assertContents([
                {
                    bufferLength: 16,
                    values: [10, 12, 13, 20, 20, 20, 20, 20],
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize - 5, 20),
                },
            ]);
        });
        
        it("borrows and shatters next node", async () => {
            const tester = new TreeTester();
            const initLength = defaultContentSize * 3;
            await tester.initWithContents([
                {
                    bufferLength: 16,
                    values: [10, 11, 12, 13],
                },
                {
                    bufferLength: initLength,
                    values: createArray(initLength, 20),
                },
            ]);
            await tester.deleteItems(0, 1, 0, 2);
            await tester.assertContents([
                {
                    bufferLength: 16,
                    values: [10, 12, 13, 20, 20, 20, 20, 20],
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 20),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize, 20),
                },
                {
                    bufferLength: defaultContentSize,
                    values: createArray(defaultContentSize - 5, 20),
                },
            ]);
        });
    });
});


