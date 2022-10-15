
import { Storage } from "./types.js";

export class FileStorage implements Storage {
    
    public init(directoryPath: string): Promise<void> {
        throw new Error("Not yet implemented.");
    }
}

export class MemoryStorage implements Storage {
    
}


