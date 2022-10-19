
import * as fs from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";

const directoryPath = pathUtils.dirname(fileURLToPath(import.meta.url));
const typesPath = pathUtils.join(directoryPath, "types.json");
const namedTypes = JSON.parse(fs.readFileSync(typesPath, "utf8"));

const getTypeInstanceName = (typeName) => (
    typeName.charAt(0).toLowerCase() + typeName.substring(1, typeName.length) + "Type"
);

class DataType {
    // Concrete subclasses of DataType must implement these methods:
    // getNestedCode, getInstanceCode
    
    constructor(data) {
        // Do nothing.
    }
    
    getDeclarationCode(name, instanceName) {
        return `export type ${name} = ${this.getNestedCode()}\n\nexport const ${instanceName} = ${this.getInstanceCode()}\n`;
    }
}

class ReferenceType extends DataType {
    
    constructor(data) {
        super(data);
        this.name = data;
        this.instanceName = getTypeInstanceName(this.name);
    }
    
    getNestedCode() {
        return this.name;
    }
    
    getInstanceCode() {
        return this.instanceName;
    }
}

class BoolType extends DataType {
    
    getNestedCode() {
        return "boolean";
    }
    
    getInstanceCode() {
        return "boolType";
    }
}

class IntType extends DataType {
    
    constructor(data) {
        super(data);
        this.size = data.size;
    }
    
    getNestedCode() {
        return "number";
    }
    
    getInstanceCode() {
        return `new IntType(${this.size})`;
    }
}

class ArrayType extends DataType {
    
    constructor(data) {
        super(data);
        this.elementType = convertDataToType(data.elementType);
        this.length = data.length;
    }
    
    getNestedCode() {
        return `${this.elementType.getNestedCode()}[]`;
    }
    
    getInstanceCode() {
        return `new ArrayType(${this.elementType.getInstanceCode()}, ${this.length})`;
    }
}

class StoragePointerType extends DataType {
    
    constructor(data) {
        super(data);
        this.elementType = convertDataToType(data.elementType);
    }
    
    getNestedCode() {
        return `StoragePointer<${this.elementType.getNestedCode()}>`;
    }
    
    getInstanceCode() {
        return "...";
    }
}

class StructType extends DataType {
    
    constructor(data) {
        super(data);
        this.fields = data.fields.map((data) => ({
            name: data.name,
            type: convertDataToType(data.type),
        }));
    }
    
    getDeclarationCode(name, instanceName) {
        const resultText = [];
        resultText.push(`export interface ${name} {`);
        for (const field of this.fields) {
            resultText.push(`    ${field.name}: ${field.type.getNestedCode()};`);
        }
        resultText.push(`}\n\nexport const ${instanceName} = new StructType<${name}>([`);
        for (const field of this.fields) {
            resultText.push(`    { name: "${field.name}", type: ${field.type.getInstanceCode()} },`);
        }
        resultText.push(`]);\n`);
        return resultText.join("\n");
    }
    
    getNestedCode() {
        return "...";
    }
    
    getInstanceCode() {
        return "...";
    }
}

const classTypeMap = { BoolType, IntType, ArrayType, StoragePointerType, StructType };

const convertDataToType = (data) => {
    let typeConstructor;
    if (typeof data === "string") {
        typeConstructor = ReferenceType;
    } else {
        const className = data.class;
        typeConstructor = classTypeMap[className];
        if (typeof typeConstructor === "undefined") {
            throw new Error(`Unknown type class "${className}".`);
        }
    }
    return new typeConstructor(data);
};

const resultText = ["\nimport { spanDegreeAmount } from \"./constants.js\";\nimport { boolType, IntType, StoragePointerType, ArrayType, StructType } from \"./dataType.js\";\nimport { StoragePointer } from \"./storagePointer.js\";\n"];

for (const namedType of namedTypes) {
    const { name } = namedType;
    const instanceName = getTypeInstanceName(name);
    const type = convertDataToType(namedType.type);
    resultText.push(type.getDeclarationCode(name, instanceName));
}
resultText.push("\n");

const destinationPath = pathUtils.join(directoryPath, "src", "builtTypes.ts");
fs.writeFileSync(destinationPath, resultText.join("\n"));


