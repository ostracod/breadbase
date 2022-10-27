
export abstract class Storage {
    
    abstract getSize(): number;
    abstract setSize(size: number): Promise<void>;
    abstract read(index: number, size: number): Promise<Buffer>;
    abstract write(index: number, data: Buffer): Promise<void>;
    abstract getVersion(): number | null;
    abstract markVersion(): Promise<void>;
}

export class FileStorage extends Storage {
    
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

export class MemoryStorage extends Storage {
    data: Buffer;
    version: number;
    
    constructor() {
        super();
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


