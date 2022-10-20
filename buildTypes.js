
import * as fs from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";

const directoryPath = pathUtils.dirname(fileURLToPath(import.meta.url));
const typesPath = pathUtils.join(directoryPath, "types.json");
const namedTypesData = JSON.parse(fs.readFileSync(typesPath, "utf8"));

const pointerTypeNames = new Set();

const uncapitalize = (text) => text.charAt(0).toLowerCase() + text.substring(1, text.length);

const getTypeInstanceName = (typeName) => uncapitalize(typeName) + "Type";

const getPointerInstanceName = (typeName) => uncapitalize(typeName);

class DataType {
    // Concrete subclasses of DataType must implement these methods:
    // getNestedCode, getInstanceCode
    
    constructor(data) {
        // Do nothing.
    }
    
    getDeclarationCode(name, instanceName) {
        return `export type ${name} = ${this.getNestedCode()}\n\nexport const ${instanceName} = ${this.getInstanceCode()}\n`;
    }
    
    getPointerInstanceCode() {
        return `new StoragePointerType(${this.getInstanceCode()})`;
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
    
    getPointerInstanceCode() {
        pointerTypeNames.add(this.name);
        return "pointerTypes." + getPointerInstanceName(this.name);
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
        return this.elementType.getPointerInstanceCode();
    }
}

class Field {
    
    constructor(name, type) {
        this.name = name;
        this.type = type;
    }
    
    getNestedCode() {
        return `${this.name}: ${this.type.getNestedCode()}`;
    }
    
    getInstanceCode() {
        return `{ name: "${this.name}", type: ${this.type.getInstanceCode()} }`;
    }
}


class FlavorField {
    
    getNestedCode() {
        return "_flavor?: { name: \"Struct\" }";
    }
}

class TailField {
    
    constructor(elementType) {
        this.elementType = elementType;
    }
    
    getNestedCode() {
        return `_tail: ${this.elementType.getNestedCode()}[]`;
    }
}

class StructType extends DataType {
    
    constructor(data) {
        super(data);
        this.allFields = [];
        this.subTypeFields = [];
        const superTypeName = data.superType;
        if (typeof superTypeName === "undefined") {
            this.superTypeName = null;
            this.allFields.push(new FlavorField());
        } else {
            this.superTypeName = superTypeName;
            const superType = typeMap.get(this.superTypeName);
            superType.allFields.forEach((field) => {
                this.allFields.push(field);
            });
        }
        data.fields.forEach((data) => {
            const field = new Field(data.name, convertDataToType(data.type));
            this.allFields.push(field);
            this.subTypeFields.push(field);
        });
    }
    
    getInterfaceName() {
        return "Struct";
    }
    
    getClassName() {
        return "StructType";
    }
    
    getParamTypeCode(name) {
        return [name];
    }
    
    getConstructorArgs() {
        if (this.superTypeName === null) {
            return [];
        } else {
            return [getTypeInstanceName(this.superTypeName)];
        }
    }
    
    getDeclarationCode(name, instanceName) {
        const resultText = [];
        let extensionText = this.getInterfaceName();
        if (this.superTypeName !== null) {
            extensionText += ", " + this.superTypeName;
        }
        resultText.push(`export interface ${name} extends ${extensionText} {`);
        for (const field of this.subTypeFields) {
            resultText.push(`    ${field.getNestedCode()};`);
        }
        const paramTypeCode = this.getParamTypeCode(name);
        resultText.push(`}\n\nexport const ${instanceName} = new ${this.getClassName()}<${paramTypeCode.join(", ")}>([`);
        for (const field of this.subTypeFields) {
            resultText.push(`    ${field.getInstanceCode()},`);
        }
        const terms = ["]", ...this.getConstructorArgs()];
        resultText.push(`${terms.join(", ")});\n`);
        return resultText.join("\n");
    }
    
    getNestedCode() {
        const fieldsCode = this.allFields.map((field) => field.getNestedCode());
        return `{ ${fieldsCode.join(", ")} }`;
    }
    
    getInstanceCode() {
        const fieldCodeList = this.subTypeFields.map((field) => field.getInstanceCode());
        const resultText = [`new ${this.getClassName()}([${fieldCodeList.join(", ")}`];
        const terms = ["]", ...this.getConstructorArgs()];
        resultText.push(`${terms.join(", ")})`);
        return resultText.join("");
    }
}

class TailStructType extends StructType {
    
    constructor(data) {
        super(data);
        this.elementType = convertDataToType(data.elementType);
        this.allFields.push(new TailField(this.elementType));
    }
    
    getInterfaceName() {
        return `TailStruct<${this.elementType.getNestedCode()}>`;
    }
    
    getClassName() {
        return "TailStructType";
    }
    
    getParamTypeCode(name) {
        return [this.elementType.getNestedCode(), name];
    }
    
    getConstructorArgs() {
        return [this.elementType.getInstanceCode(), ...super.getConstructorArgs()]
    }
}

const classTypeMap = { BoolType, IntType, ArrayType, StoragePointerType, StructType, TailStructType };

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

const resultText = ["\nimport { Struct, TailStruct } from \"./internalTypes.js\";\nimport { spanDegreeAmount } from \"./constants.js\";\nimport { boolType, IntType, StoragePointerType, ArrayType, StructType, TailStructType } from \"./dataType.js\";\nimport { StoragePointer } from \"./storagePointer.js\";\n"];

const typeMap = new Map();
const declarationsText = [];
for (const namedTypeData of namedTypesData) {
    const { name } = namedTypeData;
    const instanceName = getTypeInstanceName(name);
    const type = convertDataToType(namedTypeData.type);
    typeMap.set(name, type);
    declarationsText.push(type.getDeclarationCode(name, instanceName));
}

resultText.push("const pointerTypes = {");
for (const name of pointerTypeNames) {
    resultText.push(`    ${getPointerInstanceName(name)}: new StoragePointerType<${name}>(),`);
}
resultText.push("};\n");
resultText.push(declarationsText.join("\n"));
for (const name of pointerTypeNames) {
    resultText.push(`pointerTypes.${getPointerInstanceName(name)}.elementType = ${getTypeInstanceName(name)};`);
}
resultText.push("\n\n");

const destinationPath = pathUtils.join(directoryPath, "src", "builtTypes.ts");
fs.writeFileSync(destinationPath, resultText.join("\n"));


