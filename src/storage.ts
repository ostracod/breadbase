
import { Storage } from "./types.js";

export class FileStorage implements Storage {
    
    async init(directoryPath: string): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    getSize(): number {
        throw new Error("Not yet implemented.");
    }
    
    async setSize(size: number): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    async read(index: number, size: number): Promise<Buffer> {
        throw new Error("Not yet implemented.");
    }
    
    async write(index: number, data: Buffer): Promise<void> {
        throw new Error("Not yet implemented.");
    }
    
    getVersion(): number | null {
        throw new Error("Not yet implemented.");
    }
    
    async markVersion(): Promise<void> {
        throw new Error("Not yet implemented.");
    }
}

export class MemoryStorage implements Storage {
    private data: Buffer;
    private version: number;
    
    constructor() {
        this.data = Buffer.from([]);
        this.version = null;
    }
    
    getSize(): number {
        return this.data.length;
    }
    
    async setSize(size: number): Promise<void> {
        if (size > this.data.length) {
            this.data = Buffer.concat([this.data, Buffer.alloc(size - this.data.length)]);
        } else if (size < this.data.length) {
            this.data = this.data.subarray(0, size);
        }
    }
    
    async read(index: number, size: number): Promise<Buffer> {
        return this.data.subarray(index, index + size);
    }
    
    async write(index: number, data: Buffer): Promise<void> {
        data.copy(this.data, index);
    }
    
    getVersion(): number | null {
        return this.version;
    }
    
    async markVersion(): Promise<void> {
        if (this.version === null) {
            this.version = 0;
        } else {
            this.version += 1;
        }
    }
}


