
import * as fs from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";

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

const getParamTypesCode = (paramTypes: ParamType[]): string => {
    if (paramTypes.length > 0) {
        return `<${paramTypes.map((type) => type.getNestedTypeCode() + " = any").join(", ")}>`;
    } else {
        return "";
    }
};

type ParamMap = Map<string, DataType>;

abstract class DataType {
    
    abstract getNestedTypeCode(): string;
    
    abstract getNestedInstanceCode(): string;
    
    abstract dereference(): LiteralType;
    
    abstract replaceParamTypes(paramMap: ParamMap): DataType;
    
    getDeclarationTypeCode(name: string, paramTypes: ParamType[]): string {
        return `export type ${name}${getParamTypesCode(paramTypes)} = ${this.getNestedTypeCode()};`;
    }
    
    getDeclarationInstanceCode(name: string, paramTypes: ParamType[]): string {
        return this.getNestedInstanceCode();
    }
}

class ParamType extends DataType {
    name: string;
    
    constructor(name: string) {
        super();
        this.name = name;
    }
    
    getNestedTypeCode(): string {
        return this.name;
    }
    
    getNestedInstanceCode(): string {
        return `new ParamType("${this.name}")`;
    }
    
    dereference(): LiteralType {
        throw new Error(`Cannot dereference parameter type "${this.name}".`);
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        const replacement = paramMap.get(this.name);
        return (typeof replacement === "undefined") ? this : replacement;
    }
}

type Scope = Map<string, DataType>;

abstract class InitDataType extends DataType {
    
    abstract initWithData(scope: Scope, data: TypeData): void;
}

class ReferenceType extends InitDataType {
    name: string;
    paramReplacements: DataType[] | null;
    
    init(name: string, paramReplacements: DataType[]): void {
        this.name = name;
        this.paramReplacements = paramReplacements;
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
    
    getDeclaration(): TypeDeclaration {
        return typeDeclarationMap.get(this.name);
    }
    
    getNonNullReplacements(): DataType[] {
        if (this.paramReplacements === null) {
            return this.getDeclaration().paramTypes.map((paramType) => anyType);
        } else {
            return this.paramReplacements;
        }
    }
    
    getNestedTypeCode(): string {
        if (this.paramReplacements === null) {
            return this.name;
        } else {
            return `${this.name}<${this.paramReplacements.map((type) => type.getNestedTypeCode()).join(", ")}>`;
        }
    }
    
    getNestedInstanceCode(): string {
        const resultText = [`new ReferenceType<${this.name}>("${this.name}"`];
        const declaration = this.getDeclaration();
        if (declaration.paramTypes.length > 0) {
            const paramReplacements = this.getNonNullReplacements();
            const codeList = paramReplacements.map((paramReplacement) => paramReplacement.getNestedInstanceCode());
            resultText.push(`, [${codeList.join(", ")}]`);
        }
        resultText.push(")");
        return resultText.join("");
    }
    
    dereference(): LiteralType {
        const declaration = this.getDeclaration();
        let { type } = declaration;
        const paramMap = new Map<string, DataType>();
        this.getNonNullReplacements().forEach((paramReplacement, index) => {
            const { name } = declaration.paramTypes[index];
            paramMap.set(name, paramReplacement);
        });
        type = type.replaceParamTypes(paramMap);
        return type.dereference();
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        let replacements: DataType[] | null;
        if (this.paramReplacements === null) {
            replacements = null;
        } else {
            replacements = this.paramReplacements.map((replacement) => (
                replacement.replaceParamTypes(paramMap)
            ));
        }
        const output = new ReferenceType();
        output.init(this.name, replacements);
        return output;
    }
}

abstract class LiteralType extends InitDataType {
    
    initWithData(scope: Scope, data: LiteralTypeData): void {
        // Do nothing.
    }
    
    dereference(): LiteralType {
        return this;
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        return this;
    }
}

class AnyType extends LiteralType {
    
    getNestedTypeCode(): string {
        return "any";
    }
    
    getNestedInstanceCode(): string {
        return "anyType";
    }
}

const anyType = new AnyType();

class BoolType extends LiteralType {
    
    getNestedTypeCode(): string {
        return "boolean";
    }
    
    getNestedInstanceCode(): string {
        return "boolType";
    }
}

class IntType extends LiteralType {
    size: number;
    enumType: string | null;
    
    init(size: number, enumType: string | null = null): void {
        this.size = size;
        this.enumType = enumType;
    }
    
    initWithData(scope: Scope, data: IntTypeData): void {
        super.initWithData(scope, data);
        const { enumType } = data;
        this.init(data.size, (typeof enumType === "undefined") ? null : enumType);
    }
    
    getNestedTypeCode(): string {
        return (this.enumType === null) ? "number" : this.enumType;
    }
    
    getNestedInstanceCode(): string {
        return `new IntType(${this.size})`;
    }
}

class ArrayType extends LiteralType {
    elementType: DataType;
    length: number;
    
    init(elementType: DataType, length: number) {
        this.elementType = elementType;
        this.length = length;
    }
    
    initWithData(scope: Scope, data: ArrayTypeData): void {
        super.initWithData(scope, data);
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType, data.length);
    }
    
    getNestedTypeCode(): string {
        return `${this.elementType.getNestedTypeCode()}[]`;
    }
    
    getNestedInstanceCode(): string {
        return `new ArrayType(${this.elementType.getNestedInstanceCode()}, ${this.length})`;
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        const output = new ArrayType();
        output.init(elementType, this.length);
        return output;
    }
}

class StoragePointerType extends LiteralType {
    elementType: DataType;
    
    init(elementType: DataType) {
        this.elementType = elementType;
    }
    
    initWithData(scope: Scope, data: PointerTypeData): void {
        super.initWithData(scope, data);
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType);
    }
    
    getNestedTypeCode(): string {
        return `StoragePointer<${this.elementType.getNestedTypeCode()}>`;
    }
    
    getNestedInstanceCode(): string {
        return `new StoragePointerType(${this.elementType.getNestedInstanceCode()})`;
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        const output = new StoragePointerType();
        output.init(elementType);
        return output;
    }
}

abstract class Field {
    
    abstract getNestedTypeCode(): string;
}

class MemberField extends Field {
    name: string;
    type: DataType;
    
    constructor(name: string, type: DataType) {
        super();
        this.name = name;
        this.type = type;
    }
    
    getNestedTypeCode(): string {
        return `${this.name}: ${this.type.getNestedTypeCode()}`;
    }
    
    getNestedInstanceCode(): string {
        return `{ name: "${this.name}", type: ${this.type.getNestedInstanceCode()} }`;
    }
    
    replaceParamTypes(paramMap: ParamMap): MemberField {
        const type = this.type.replaceParamTypes(paramMap);
        return new MemberField(this.name, type);
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
    subTypeFields: MemberField[];
    memberFields: MemberField[];
    allFields: Field[];
    superType: StructType | null;
    
    initStruct(fields: MemberField[], superType: StructType | null = null): void {
        this.subTypeFields = fields;
        this.memberFields = [];
        this.allFields = [new FlavorField()];
        this.superType = superType;
        if (this.superType !== null) {
            const structType = this.superType.dereference() as StructType;
            structType.memberFields.forEach((field) => {
                this.addMemberField(field);
            });
        }
        this.subTypeFields.forEach((field) => {
            this.addMemberField(field);
        });
    }
    
    init(fields: MemberField[], superType: StructType | null = null) {
        this.initStruct(fields, superType);
    }
    
    initWithData(scope: Scope, data: StructTypeData): void {
        super.initWithData(scope, data);
        const superTypeData = data.superType;
        let superType: StructType | null;
        if (typeof superTypeData === "undefined") {
            superType = null;
        } else {
            superType = convertDataToType(scope, superTypeData) as StructType;
        }
        const fields = data.fields.map((fieldData) => (
            new MemberField(fieldData.name, convertDataToType(scope, fieldData.type))
        ));
        this.initStruct(fields, superType);
    }
    
    addMemberField(field: MemberField): void {
        this.memberFields.push(field);
        this.allFields.push(field);
    }
    
    getInterfaceName(): string {
        return "Struct";
    }
    
    getClassName(): string {
        return "StructType";
    }
    
    getConstructorArgs(): string[] {
        if (this.superType === null) {
            return [];
        } else {
            return [this.superType.getNestedInstanceCode()];
        }
    }
    
    getDeclarationTypeCode(name: string, paramTypes: ParamType[]): string {
        const resultText: string[] = [];
        let extensionText = this.getInterfaceName();
        if (this.superType !== null) {
            extensionText += ", " + this.superType.getNestedTypeCode();
        }
        resultText.push(`export interface ${name}${getParamTypesCode(paramTypes)} extends ${extensionText} {`);
        for (const field of this.subTypeFields) {
            resultText.push(`    ${field.getNestedTypeCode()};`);
        }
        resultText.push("}");
        return resultText.join("\n");
    }
    
    getDeclarationInstanceCode(name: string, paramTypes: ParamType[]): string {
        const resultText: string[] = [`new ${this.getClassName()}<${name}>([`];
        for (const field of this.subTypeFields) {
            resultText.push(`    ${field.getNestedInstanceCode()},`);
        }
        resultText.push(["]", ...this.getConstructorArgs()].join(", ") + ")");
        return resultText.join("\n");
    }
    
    getNestedTypeCode(): string {
        const fieldsCode = this.allFields.map((field) => field.getNestedTypeCode());
        return `{ ${fieldsCode.join(", ")} }`;
    }
    
    getNestedInstanceCode(): string {
        const fieldCodeList = this.subTypeFields.map(
            (field) => field.getNestedInstanceCode(),
        );
        const resultText = [`new ${this.getClassName()}([${fieldCodeList.join(", ")}`];
        const terms = ["]", ...this.getConstructorArgs()];
        resultText.push(`${terms.join(", ")})`);
        return resultText.join("");
    }
    
    replaceParamsHelper(paramMap: ParamMap, structType: StructType): void {
        const fields = this.subTypeFields.map((field) => (
            field.replaceParamTypes(paramMap)
        ));
        let superType: StructType | null;
        if (this.superType === null) {
            superType = null;
        } else {
            superType = this.superType.replaceParamTypes(paramMap) as StructType;
        }
        structType.initStruct(fields, superType);
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        const output = new StructType();
        this.replaceParamsHelper(paramMap, output);
        return output;
    }
}

class TailStructType extends StructType {
    uninheritedElementType: DataType | null;
    elementType: DataType;
    
    initElementType(elementType: DataType | null = null): void {
        this.uninheritedElementType = elementType;
        if (this.uninheritedElementType === null) {
            this.elementType = (this.superType.dereference() as TailStructType).elementType;
        } else {
            this.elementType = this.uninheritedElementType;
        }
        this.allFields.push(new TailField(this.elementType));
    }
    
    init(
        fields: MemberField[],
        superType: StructType | null = null,
        elementType: DataType | null = null,
    ) {
        this.initStruct(fields, superType);
        this.initElementType(elementType);
    }
    
    initWithData(scope: Scope, data: TailStructTypeData): void {
        super.initWithData(scope, data);
        const elementTypeData = data.elementType;
        let elementType: DataType | null;
        if (typeof elementTypeData === "undefined") {
            elementType = null;
        } else {
            elementType = convertDataToType(scope, data.elementType);
        }
        this.initElementType(elementType);
    }
    
    getInterfaceName(): string {
        return `TailStruct<${this.elementType.getNestedTypeCode()}>`;
    }
    
    getClassName(): string {
        return "TailStructType";
    }
    
    getConstructorArgs(): string[] {
        return [this.elementType.getNestedInstanceCode(), ...super.getConstructorArgs()];
    }
    
    replaceParamTypes(paramMap: ParamMap): DataType {
        let elementType: DataType | null;
        if (this.uninheritedElementType === null) {
            elementType = null;
        } else {
            elementType = this.uninheritedElementType.replaceParamTypes(paramMap);
        }
        const output = new TailStructType();
        this.replaceParamsHelper(paramMap, output);
        output.initElementType(elementType);
        return output;
    }
}

type InitTypeConstructor = new () => InitDataType;

const literalTypeMap: { [name: string]: InitTypeConstructor } = {
    AnyType, BoolType, IntType, ArrayType, StoragePointerType, StructType, TailStructType,
};

class TypeDeclaration {
    name: string;
    paramTypes: ParamType[];
    type: DataType;
    
    constructor(data: DeclarationData) {
        this.name = data.name;
        const paramTypeNames = data.paramTypes;
        if (typeof paramTypeNames === "undefined") {
            this.paramTypes = [];
        } else {
            this.paramTypes = paramTypeNames.map((name) => new ParamType(name));
        }
        const scope = new Map<string, DataType>();
        this.paramTypes.forEach((paramType) => {
            scope.set(paramType.name, paramType);
        });
        this.type = convertDataToType(scope, data.type);
    }
    
    getCode(): string {
        const typeCode = this.type.getDeclarationTypeCode(this.name, this.paramTypes);
        const instanceCode = this.type.getDeclarationInstanceCode(this.name, this.paramTypes);
        const resultText = [`${typeCode}\n\nexport const ${getTypeInstanceName(this.name)} = addTypeDeclaration("${this.name}", ${instanceCode}`];
        if (this.paramTypes.length > 0) {
            const namesCode = this.paramTypes.map((paramType) => `"${paramType.name}"`);
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

const typeDeclarationMap = new Map<string, TypeDeclaration>();
for (const data of typeDeclarationsData) {
    const declaration = new TypeDeclaration(data);
    typeDeclarationMap.set(declaration.name, declaration);
}
typeDeclarationMap.forEach((declaration) => {
    resultText.push(declaration.getCode());
});
resultText.push("\n");

const destinationPath = pathUtils.join(directoryPath, "..", "src", "builtTypes.ts");
fs.writeFileSync(destinationPath, resultText.join("\n"));


