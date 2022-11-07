
import * as fs from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";
import { BaseDataType, BaseParamType, BaseReferenceType, BaseLiteralType, BaseAnyType, BaseBoolType, BaseIntType, BaseArrayType, BaseStoragePointerType, BaseMemberField, BaseStructType, BaseTailStructType, BaseTypeDeclaration } from "./baseTypes.js";

interface NamedTypeData {
    name: string;
}

interface ReferenceTypeData extends NamedTypeData {
    paramTypes?: TypeData[];
}

interface LiteralTypeData {
    class: string;
}

interface IntTypeData extends LiteralTypeData {
    size: number;
    enumType?: string;
}

interface ArrayTypeData extends LiteralTypeData {
    elementType: TypeData;
    length: number;
}

interface PointerTypeData extends LiteralTypeData {
    elementType: TypeData;
}

interface FieldData {
    name: string;
    type: TypeData;
}

interface StructTypeData extends LiteralTypeData {
    fields: FieldData[];
    superType?: TypeData;
}

interface TailStructTypeData extends StructTypeData {
    elementType?: TypeData;
}

type TypeData = string | NamedTypeData | LiteralTypeData;

interface DeclarationData {
    name: string;
    paramTypes: string[];
    type: TypeData;
}

const directoryPath = pathUtils.dirname(fileURLToPath(import.meta.url));
const typesPath = pathUtils.join(directoryPath, "..", "src", "types.json");
const typeDeclarationsData: DeclarationData[] = JSON.parse(
    fs.readFileSync(typesPath, "utf8"),
);

const uncapitalize = (text: string): string => (
    text.charAt(0).toLowerCase() + text.substring(1, text.length)
);

const getTypeInstanceName = (typeName: string): string => uncapitalize(typeName) + "Type";

const getParamTypesCode = (paramTypeNames: string[]): string => {
    if (paramTypeNames.length > 0) {
        return `<${paramTypeNames.map((name) => name + " = any").join(", ")}>`;
    } else {
        return "";
    }
};

abstract class DataType {
    base: BaseDataType<DataType>;
    
    abstract getNestedTypeCode(): string;
    
    abstract getNestedInstanceCode(): string;
    
    getDeclarationTypeCode(name: string, paramTypeNames: string[]): string {
        return `export type ${name}${getParamTypesCode(paramTypeNames)} = ${this.getNestedTypeCode()};`;
    }
    
    getDeclarationInstanceCode(name: string): string {
        return this.getNestedInstanceCode();
    }
}

class ParamType extends DataType {
    base: BaseParamType<DataType>;
    
    constructor(name: string) {
        super();
        this.base = new BaseParamType<DataType>(name);
    }
    
    getNestedTypeCode(): string {
        return this.base.name;
    }
    
    getNestedInstanceCode(): string {
        return `new ParamType("${this.base.name}")`;
    }
}

type Scope = Map<string, DataType>;

abstract class InitDataType extends DataType {
    
    initWithData(scope: Scope, data: TypeData): void {
        // Do nothing.
    }
}

class ReferenceType extends InitDataType {
    base: BaseReferenceType<DataType>;
    
    init(name: string, paramReplacements: DataType[] | null): void {
        this.base = new BaseReferenceType<DataType>(
            baseDeclarationMap,
            name,
            paramReplacements.map((replacement) => replacement.base),
        );
    }
    
    initWithData(scope: Scope, data: ReferenceTypeData): void {
        const paramReplacementsData = data.paramTypes;
        let paramReplacements: DataType[];
        if (typeof paramReplacementsData === "undefined") {
            paramReplacements = null;
        } else {
            paramReplacements = paramReplacementsData.map((typeData) => (
                convertDataToType(scope, typeData)
            ));
        }
        this.init(data.name, paramReplacements);
    }
    
    getNestedTypeCode(): string {
        if (this.base.paramReplacements === null) {
            return this.base.name;
        } else {
            return `${this.base.name}<${this.base.paramReplacements.map((type) => type.parent.getNestedTypeCode()).join(", ")}>`;
        }
    }
    
    getNestedInstanceCode(): string {
        const resultText = [`new ReferenceType<${this.base.name}>("${this.base.name}"`];
        const declaration = this.base.getDeclaration();
        if (declaration.paramTypeNames.length > 0) {
            const paramReplacements = this.base.getNonNullReplacements();
            const codeList = paramReplacements.map((paramReplacement) => paramReplacement.parent.getNestedInstanceCode());
            resultText.push(`, [${codeList.join(", ")}]`);
        }
        resultText.push(")");
        return resultText.join("");
    }
}

abstract class LiteralType extends InitDataType {
    base: BaseLiteralType<DataType>;
}

class AnyType extends LiteralType {
    base: BaseAnyType<DataType>;
    
    getNestedTypeCode(): string {
        return "any";
    }
    
    getNestedInstanceCode(): string {
        return "anyType";
    }
}

class BoolType extends LiteralType {
    base: BaseBoolType<DataType>;
    
    getNestedTypeCode(): string {
        return "boolean";
    }
    
    getNestedInstanceCode(): string {
        return "boolType";
    }
}

class IntType extends LiteralType {
    base: BaseIntType<DataType>;
    enumType: string | null;
    
    init(size: number, enumType: string | null = null): void {
        this.base = new BaseIntType<DataType>(size);
        this.enumType = enumType;
    }
    
    initWithData(scope: Scope, data: IntTypeData): void {
        const { enumType } = data;
        this.init(data.size, (typeof enumType === "undefined") ? null : enumType);
    }
    
    getNestedTypeCode(): string {
        return (this.enumType === null) ? "number" : this.enumType;
    }
    
    getNestedInstanceCode(): string {
        return `new IntType(${this.base.size})`;
    }
}

class ArrayType extends LiteralType {
    base: BaseArrayType<DataType>;
    
    init(elementType: DataType, length: number) {
        this.base = new BaseArrayType<DataType>(elementType.base, length);
    }
    
    initWithData(scope: Scope, data: ArrayTypeData): void {
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType, data.length);
    }
    
    getNestedTypeCode(): string {
        return `${this.base.elementType.parent.getNestedTypeCode()}[]`;
    }
    
    getNestedInstanceCode(): string {
        return `new ArrayType(${this.base.elementType.parent.getNestedInstanceCode()}, ${this.base.length})`;
    }
}

class StoragePointerType extends LiteralType {
    base: BaseStoragePointerType<DataType>;
    
    init(elementType: DataType) {
        this.base = new BaseStoragePointerType<DataType>(elementType.base);
    }
    
    initWithData(scope: Scope, data: PointerTypeData): void {
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType);
    }
    
    getNestedTypeCode(): string {
        return `StoragePointer<${this.base.elementType.parent.getNestedTypeCode()}>`;
    }
    
    getNestedInstanceCode(): string {
        return `new StoragePointerType(${this.base.elementType.parent.getNestedInstanceCode()})`;
    }
}

abstract class Field {
    
    abstract getNestedTypeCode(): string;
}

class MemberField extends Field {
    base: BaseMemberField<DataType>;
    
    constructor(name: string, type: DataType) {
        super();
        this.base = new BaseMemberField<DataType>(name, type.base);
    }
    
    getNestedTypeCode(): string {
        return `${this.base.name}: ${this.base.type.parent.getNestedTypeCode()}`;
    }
    
    getNestedInstanceCode(): string {
        return `{ name: "${this.base.name}", type: ${this.base.type.parent.getNestedInstanceCode()} }`;
    }
}

class FlavorField extends Field {
    
    getNestedTypeCode(): string {
        return "_flavor?: { name: \"Struct\" }";
    }
}

class TailField extends Field {
    elementType: DataType;
    
    constructor(elementType: DataType) {
        super();
        this.elementType = elementType;
    }
    
    getNestedTypeCode(): string {
        return `_tail: ${this.elementType.getNestedTypeCode()}[]`;
    }
}

class StructType extends LiteralType {
    base: BaseStructType<DataType>;
    allFields: Field[];
    
    initAllFields(): void {
        this.allFields = [new FlavorField()];
        this.base.memberFields.forEach((field) => {
            this.allFields.push(field.parent);
        });
    }
    
    init(fields: MemberField[], superType: DataType | null = null) {
        this.base = new BaseStructType<DataType>(
            fields.map((field) => field.base),
            (superType === null) ? null : superType.base,
        );
        this.initAllFields();
    }
    
    initWithDataHelper(
        scope: Scope,
        data: StructTypeData,
    ): { fields: MemberField[], superType: DataType } {
        const superTypeData = data.superType;
        let superType: DataType | null;
        if (typeof superTypeData === "undefined") {
            superType = null;
        } else {
            superType = convertDataToType(scope, superTypeData);
        }
        const fields = data.fields.map((fieldData) => (
            new MemberField(fieldData.name, convertDataToType(scope, fieldData.type))
        ));
        return { fields, superType };
    }
    
    initWithData(scope: Scope, data: StructTypeData): void {
        const { fields, superType } = this.initWithDataHelper(scope, data);
        this.init(fields, superType);
    }
    
    getInterfaceName(): string {
        return "Struct";
    }
    
    getClassName(): string {
        return "StructType";
    }
    
    getConstructorArgs(): string[] {
        if (this.base.superType === null) {
            return [];
        } else {
            return [this.base.superType.parent.getNestedInstanceCode()];
        }
    }
    
    getDeclarationTypeCode(name: string, paramTypeNames: string[]): string {
        const resultText: string[] = [];
        let extensionText = this.getInterfaceName();
        if (this.base.superType !== null) {
            extensionText += ", " + this.base.superType.parent.getNestedTypeCode();
        }
        resultText.push(`export interface ${name}${getParamTypesCode(paramTypeNames)} extends ${extensionText} {`);
        for (const field of this.base.subTypeFields) {
            resultText.push(`    ${field.parent.getNestedTypeCode()};`);
        }
        resultText.push("}");
        return resultText.join("\n");
    }
    
    getDeclarationInstanceCode(name: string): string {
        const resultText: string[] = [`new ${this.getClassName()}<${name}>([`];
        for (const field of this.base.subTypeFields) {
            resultText.push(`    ${field.parent.getNestedInstanceCode()},`);
        }
        resultText.push(["]", ...this.getConstructorArgs()].join(", ") + ")");
        return resultText.join("\n");
    }
    
    getNestedTypeCode(): string {
        const fieldsCode = this.allFields.map((field) => field.getNestedTypeCode());
        return `{ ${fieldsCode.join(", ")} }`;
    }
    
    getNestedInstanceCode(): string {
        const fieldCodeList = this.base.subTypeFields.map(
            (field) => field.parent.getNestedInstanceCode(),
        );
        const resultText = [`new ${this.getClassName()}([${fieldCodeList.join(", ")}`];
        const terms = ["]", ...this.getConstructorArgs()];
        resultText.push(`${terms.join(", ")})`);
        return resultText.join("");
    }
}

class TailStructType extends StructType {
    base: BaseTailStructType<DataType>;
    
    initAllFields(): void {
        super.initAllFields();
        this.allFields.push(new TailField(this.base.elementType.parent));
    }
    
    init(
        fields: MemberField[],
        superType: DataType | null = null,
        elementType: DataType | null = null,
    ) {
        this.base = new BaseTailStructType<DataType>(
            fields.map((field) => field.base),
            (superType === null) ? null : superType.base,
            (elementType === null) ? null : elementType.base,
        );
        this.initAllFields();
    }
    
    initWithData(scope: Scope, data: TailStructTypeData): void {
        const { fields, superType } = this.initWithDataHelper(scope, data);
        const elementTypeData = data.elementType;
        let elementType: DataType | null;
        if (typeof elementTypeData === "undefined") {
            elementType = null;
        } else {
            elementType = convertDataToType(scope, data.elementType);
        }
        this.init(fields, superType, elementType);
    }
    
    getInterfaceName(): string {
        return `TailStruct<${this.base.elementType.parent.getNestedTypeCode()}>`;
    }
    
    getClassName(): string {
        return "TailStructType";
    }
    
    getConstructorArgs(): string[] {
        return [this.base.elementType.parent.getNestedInstanceCode(), ...super.getConstructorArgs()];
    }
}

type InitTypeConstructor = new () => InitDataType;

const literalTypeMap: { [name: string]: InitTypeConstructor } = {
    AnyType, BoolType, IntType, ArrayType, StoragePointerType, StructType, TailStructType,
};

class TypeDeclaration {
    base: BaseTypeDeclaration<DataType>;
    
    initWithData(data: DeclarationData) {
        let paramTypeNames = data.paramTypes;
        const scope = new Map<string, DataType>();
        paramTypeNames.forEach((name) => {
            scope.set(name, new ParamType(name));
        });
        const type = convertDataToType(scope, data.type);
        if (typeof paramTypeNames === "undefined") {
            paramTypeNames = [];
        }
        this.init(data.name, type, paramTypeNames);
    }
    
    init(name: string, type: DataType, paramTypeNames: string[]) {
        this.base = new BaseTypeDeclaration<DataType>(name, type.base, paramTypeNames);
    }
    
    getCode(): string {
        const { name, paramTypeNames } = this.base;
        const typeCode = this.base.type.parent.getDeclarationTypeCode(name, paramTypeNames);
        const instanceCode = this.base.type.parent.getDeclarationInstanceCode(name);
        const resultText = [`${typeCode}\n\nexport const ${getTypeInstanceName(name)} = addTypeDeclaration("${name}", ${instanceCode}`];
        if (paramTypeNames.length > 0) {
            const namesCode = paramTypeNames.map((paramTypeName) => `"${paramTypeName}"`);
            resultText.push(`, [${namesCode.join(", ")}]`);
        }
        resultText.push(");\n");
        return resultText.join("");
    }
}

const convertDataToType = (scope: Scope, inputData: TypeData): DataType => {
    let data: NamedTypeData | LiteralTypeData;
    if (typeof inputData === "string") {
        data = { name: inputData };
    } else {
        data = inputData;
    }
    let typeConstructor: InitTypeConstructor;
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

const resultText = ["\nimport { Struct, TailStruct } from \"./internalTypes.js\";\nimport { spanDegreeAmount, AllocType } from \"./constants.js\";\nimport { addTypeDeclaration, ParamType, ReferenceType, anyType, boolType, IntType, StoragePointerType, ArrayType, StructType, TailStructType } from \"./dataType.js\";\nimport { StoragePointer } from \"./storagePointer.js\";\n"];

const typeDeclarations = typeDeclarationsData.map((data) => {
    const declaration = new TypeDeclaration();
    declaration.initWithData(data);
    return declaration;
});
const anyTypeDeclaration = new TypeDeclaration();
anyTypeDeclaration.init("Any", new AnyType(), []);
typeDeclarations.push(anyTypeDeclaration);

const baseDeclarationMap = new Map<string, BaseTypeDeclaration<DataType>>();
typeDeclarations.forEach((declaration) => {
    baseDeclarationMap.set(declaration.base.name, declaration.base);
});

typeDeclarations.forEach((declaration) => {
    resultText.push(declaration.getCode());
});
resultText.push("\n");

const destinationPath = pathUtils.join(directoryPath, "..", "src", "builtTypes.ts");
fs.writeFileSync(destinationPath, resultText.join("\n"));


