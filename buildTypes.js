
import * as fs from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";

const directoryPath = pathUtils.dirname(fileURLToPath(import.meta.url));
const typesPath = pathUtils.join(directoryPath, "types.json");
const typeDeclarationsData = JSON.parse(fs.readFileSync(typesPath, "utf8"));

const pointerTypeNames = new Set();

const uncapitalize = (text) => text.charAt(0).toLowerCase() + text.substring(1, text.length);

const getTypeInstanceName = (typeName) => uncapitalize(typeName) + "Type";

const getPointerInstanceName = (typeName) => uncapitalize(typeName);

const getParamTypesCode = (paramTypes) => {
    if (paramTypes.length > 0) {
        return `<${paramTypes.map((type) => type.getNestedCode() + " = any").join(", ")}>`;
    } else {
        return "";
    }
};

class DataType {
    // Concrete subclasses of DataType must implement these methods:
    // getNestedCode, getInstanceCode, replaceParamTypes
    
    getDeclarationCode(name, paramTypes) {
        return `export type ${name}${getParamTypesCode(paramTypes)} = ${this.getNestedCode()}\n\nexport const ${getTypeInstanceName(name)} = ${this.getInstanceCode()}\n`;
    }
    
    getPointerInstanceCode() {
        return `new StoragePointerType(${this.getInstanceCode()})`;
    }
    
    dereference() {
        return this;
    }
}

class ParamType extends DataType {
    
    constructor(name) {
        super();
        this.name = name;
    }
    
    getNestedCode() {
        return this.name;
    }
    
    getInstanceCode() {
        return anyType.getInstanceCode();
    }
    
    dereference() {
        return anyType;
    }
    
    replaceParamTypes(paramReplacementMap) {
        const replacement = paramReplacementMap.get(this.name);
        return (typeof replacement === "undefined") ? this : replacement;
    }
}

class ReferenceType extends DataType {
    
    init(name, paramReplacements) {
        this.name = name;
        this.instanceName = getTypeInstanceName(this.name);
        this.paramReplacements = paramReplacements;
    }
    
    initWithData(scope, data) {
        const paramReplacementsData = data.paramTypes;
        let paramReplacements;
        if (typeof paramReplacementsData === "undefined") {
            paramReplacements = [];
        } else {
            paramReplacements = paramReplacementsData.map((typeData) => (
                convertDataToType(scope, typeData)
            ));
        }
        this.init(data.name, paramReplacements);
    }
    
    getNestedCode() {
        if (this.paramReplacements.length > 0) {
            return `${this.name}<${this.paramReplacements.map((type) => type.getNestedCode()).join(", ")}>`;
        } else {
            return this.name;
        }
    }
    
    getInstanceCode() {
        return this.instanceName;
    }
    
    getPointerInstanceCode() {
        pointerTypeNames.add(this.name);
        return "pointerTypes." + getPointerInstanceName(this.name);
    }
    
    dereference() {
        const declaration = typeDeclarationMap.get(this.name);
        let { type } = declaration;
        if (this.paramReplacements.length > 0) {
            const paramReplacementMap = new Map();
            this.paramReplacements.forEach((paramReplacement, index) => {
                const name = declaration.paramTypes[index].name;
                paramReplacementMap.set(name, paramReplacement);
            });
            type = type.replaceParamTypes(paramReplacementMap);
        }
        return type.dereference();
    }
    
    replaceParamTypes(paramReplacementMap) {
        const replacements = this.paramReplacements.map((replacement) => (
            replacement.replaceParamTypes(paramReplacementMap)
        ));
        const output = new ReferenceType();
        output.init(this.name, replacements);
        return output;
    }
}

class LiteralType extends DataType {
    
    initWithData(scope, data) {
        // Do nothing.
    }
    
    replaceParamTypes(paramReplacementMap) {
        return this;
    }
}

class AnyType extends LiteralType {
    
    getNestedCode() {
        return "any";
    }
    
    getInstanceCode() {
        return "anyType";
    }
}

const anyType = new AnyType(new Map(), null);

class BoolType extends LiteralType {
    
    getNestedCode() {
        return "boolean";
    }
    
    getInstanceCode() {
        return "boolType";
    }
}

class IntType extends LiteralType {
    
    init(size, enumType = null) {
        this.size = size;
        this.enumType = enumType;
    }
    
    initWithData(scope, data) {
        super.initWithData(scope, data);
        const { enumType } = data;
        this.init(data.size, (typeof enumType === "undefined") ? null : enumType);
    }
    
    getNestedCode() {
        return (this.enumType === null) ? "number" : this.enumType;
    }
    
    getInstanceCode() {
        return `new IntType(${this.size})`;
    }
}

class ArrayType extends LiteralType {
    
    init(elementType, length) {
        this.elementType = elementType;
        this.length = length;
    }
    
    initWithData(scope, data) {
        super.initWithData(scope, data);
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType, data.length);
    }
    
    getNestedCode() {
        return `${this.elementType.getNestedCode()}[]`;
    }
    
    getInstanceCode() {
        return `new ArrayType(${this.elementType.getInstanceCode()}, ${this.length})`;
    }
    
    replaceParamTypes(paramReplacementMap) {
        const elementType = this.elementType.replaceParamTypes(paramReplacementMap);
        const output = new ArrayType();
        output.init(elementType, this.length);
        return output;
    }
}

class StoragePointerType extends LiteralType {
    
    init(elementType) {
        this.elementType = elementType;
    }
    
    initWithData(scope, data) {
        super.initWithData(scope, data);
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType);
    }
    
    getNestedCode() {
        return `StoragePointer<${this.elementType.getNestedCode()}>`;
    }
    
    getInstanceCode() {
        return this.elementType.getPointerInstanceCode();
    }
    
    replaceParamTypes(paramReplacementMap) {
        const elementType = this.elementType.replaceParamTypes(paramReplacementMap);
        const output = new StoragePointerType();
        output.init(elementType);
        return output;
    }
}

class MemberField {
    
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
    
    replaceParamTypes(paramReplacementMap) {
        const type = this.type.replaceParamTypes(paramReplacementMap);
        return new MemberField(this.name, type);
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

class StructType extends LiteralType {
    
    initStruct(fields, superType = null) {
        this.subTypeFields = fields;
        this.memberFields = [];
        this.allFields = [new FlavorField()];
        this.superType = superType;
        if (this.superType !== null) {
            const structType = this.superType.dereference();
            structType.memberFields.forEach((field) => {
                this.addMemberField(field);
            });
        }
        this.subTypeFields.forEach((field) => {
            this.addMemberField(field);
        });
    }
    
    init(fields, superType = null) {
        this.initStruct(fields, superType);
    }
    
    initWithData(scope, data) {
        super.initWithData(scope, data);
        const superTypeData = data.superType;
        let superType;
        if (typeof superTypeData === "undefined") {
            superType = null;
        } else {
            superType = convertDataToType(scope, superTypeData);
        }
        const fields = data.fields.map((fieldData) => (
            new MemberField(fieldData.name, convertDataToType(scope, fieldData.type))
        ));
        this.initStruct(fields, superType);
    }
    
    addMemberField(field) {
        this.memberFields.push(field);
        this.allFields.push(field);
    }
    
    getInterfaceName() {
        return "Struct";
    }
    
    getClassName() {
        return "StructType";
    }
    
    getConstructorArgs() {
        if (this.superType === null) {
            return [];
        } else {
            return [this.superType.getInstanceCode()];
        }
    }
    
    getDeclarationCode(name, paramTypes) {
        const resultText = [];
        let extensionText = this.getInterfaceName();
        if (this.superType !== null) {
            extensionText += ", " + this.superType.getNestedCode();
        }
        resultText.push(`export interface ${name}${getParamTypesCode(paramTypes)} extends ${extensionText} {`);
        for (const field of this.subTypeFields) {
            resultText.push(`    ${field.getNestedCode()};`);
        }
        resultText.push(`}\n\nexport const ${getTypeInstanceName(name)} = new ${this.getClassName()}<${name}>([`);
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
    
    replaceParamsHelper(paramReplacementMap, structType) {
        const fields = this.subTypeFields.map((field) => (
            field.replaceParamTypes(paramReplacementMap)
        ));
        let superType;
        if (this.superType === null) {
            superType = null;
        } else {
            superType = this.superType.replaceParamTypes(paramReplacementMap);
        }
        structType.initStruct(fields, superType);
    }
    
    replaceParamTypes(paramReplacementMap) {
        const output = new StructType();
        this.replaceParamsHelper(paramReplacementMap, output);
        return output;
    }
}

class TailStructType extends StructType {
    
    initElementType(elementType = null) {
        this.initElementType = elementType;
        if (this.initElementType === null) {
            this.elementType = this.superType.dereference().elementType;
        } else {
            this.elementType = this.initElementType;
        }
        this.allFields.push(new TailField(this.elementType));
    }
    
    init(fields, superType = null, elementType = null) {
        this.initStruct(fields, superType);
        this.initElementType(elementType);
    }
    
    initWithData(scope, data) {
        super.initWithData(scope, data);
        const elementTypeData = data.elementType;
        let elementType;
        if (typeof elementTypeData === "undefined") {
            elementType = null;
        } else {
            elementType = convertDataToType(scope, data.elementType);
        }
        this.initElementType(elementType);
    }
    
    getInterfaceName() {
        return `TailStruct<${this.elementType.getNestedCode()}>`;
    }
    
    getClassName() {
        return "TailStructType";
    }
    
    getConstructorArgs() {
        return [this.elementType.getInstanceCode(), ...super.getConstructorArgs()];
    }
    
    replaceParamTypes(paramReplacementMap) {
        let elementType;
        if (this.initElementType === null) {
            elementType = null;
        } else {
            elementType = this.initElementType.replaceParamTypes(paramReplacementMap);
        }
        const output = new TailStructType();
        this.replaceParamsHelper(paramReplacementMap, output);
        output.initElementType(elementType);
        return output;
    }
}

const literalTypeMap = { AnyType, BoolType, IntType, ArrayType, StoragePointerType, StructType, TailStructType };

class TypeDeclaration {
    
    constructor(data) {
        this.name = data.name;
        let paramTypes;
        const paramTypeNames = data.paramTypes;
        if (typeof paramTypeNames === "undefined") {
            this.paramTypes = [];
        } else {
            this.paramTypes = paramTypeNames.map((name) => new ParamType(name));
        }
        const scope = new Map();
        this.paramTypes.forEach((paramType) => {
            scope.set(paramType.name, paramType);
        });
        this.type = convertDataToType(scope, data.type);
    }
    
    getCode() {
        return this.type.getDeclarationCode(this.name, this.paramTypes);
    }
}

// `scope` is a Map from name to DataType.
const convertDataToType = (scope, inputData) => {
    const data = (typeof inputData === "string") ? { name: inputData } : inputData;
    let typeConstructor;
    if ("class" in data) {
        const className = data.class;
        typeConstructor = literalTypeMap[className];
        if (typeof typeConstructor === "undefined") {
            throw new Error(`Unknown type class "${className}".`);
        }
    } else if ("name" in data) {
        const { name } = data;
        const type = scope.get(name);
        if (typeof type !== "undefined") {
            return type;
        }
        typeConstructor = ReferenceType;
    } else {
        throw new Error(`Invalid type data ${JSON.stringify(inputData)}.`);
    }
    const output = new typeConstructor();
    output.initWithData(scope, data);
    return output;
};

const resultText = ["\nimport { Struct, TailStruct } from \"./internalTypes.js\";\nimport { spanDegreeAmount, AllocType } from \"./constants.js\";\nimport { anyType, boolType, IntType, StoragePointerType, ArrayType, StructType, TailStructType } from \"./dataType.js\";\nimport { StoragePointer } from \"./storagePointer.js\";\n"];

const typeDeclarationMap = new Map();
const declarationsText = [];
for (const data of typeDeclarationsData) {
    const declaration = new TypeDeclaration(data);
    typeDeclarationMap.set(declaration.name, declaration);
    declarationsText.push(declaration.getCode());
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


