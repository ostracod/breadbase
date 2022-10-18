
export type StoragePointer<T = any> = number;

export interface Storage {
    getSize(): number;
    setSize(size: number): Promise<void>;
    read(index: number, size: number): Promise<Buffer>;
    write(index: number, data: Buffer): Promise<void>;
    getVersion(): number | null;
    markVersion(): Promise<void>;
}


