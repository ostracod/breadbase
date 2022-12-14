
import * as fs from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";
import { ParentTypes, ParentDataType, BaseDataType, BaseParamType, BaseReferenceType, BaseLiteralType, BaseAnyType, BaseBoolType, BaseIntType, BaseStoragePointerType, BaseBufferType, BaseArrayType, ParentMemberField, BaseMemberField, BaseStructType, BaseTailStructType, BaseTypeDeclaration } from "./baseTypes.js";

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

interface BufferTypeData extends LiteralTypeData {
    size: number;
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
        return `<${paramTypeNames.map((name) => name + " = unknown").join(", ")}>`;
    } else {
        return "";
    }
};

interface PrebuildTypes extends ParentTypes {
    dataType: DataType;
    memberField: MemberField;
    typeDeclaration: TypeDeclaration;
}

abstract class DataType implements ParentDataType<PrebuildTypes> {
    base: BaseDataType<PrebuildTypes>;
    
    abstract getNestedTypeCode(paramsAreUnknown: boolean): string;
    
    abstract getNestedInstanceCode(): string;
    
    copyWithoutBase(): DataType {
        return new (this.constructor as (new() => DataType))();
    }
    
    initWithBase(base: BaseDataType<PrebuildTypes>): void {
        this.base = base;
    }
    
    getAnyType(): BaseAnyType<PrebuildTypes> {
        return anyType.base;
    }
    
    getDeclarationTypeCode(name: string, paramTypeNames: string[]): string {
        return `export type ${name}${getParamTypesCode(paramTypeNames)} = ${this.getNestedTypeCode(false)};`;
    }
    
    getDeclarationInstanceCode(name: string): string {
        return this.getNestedInstanceCode();
    }
}

class ParamType extends DataType {
    base: BaseParamType<PrebuildTypes>;
    
    init(name: string): void {
        this.initWithBase(new BaseParamType<PrebuildTypes>(this, name));
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return paramsAreUnknown ? "unknown" : this.base.name;
    }
    
    getNestedInstanceCode(): string {
        return `(new ParamType()).init("${this.base.name}")`;
    }
}

type Scope = Map<string, DataType>;

abstract class InitDataType extends DataType {
    
    initWithData(scope: Scope, data: TypeData): void {
        // Do nothing.
    }
}

class ReferenceType extends InitDataType {
    base: BaseReferenceType<PrebuildTypes>;
    
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
    
    init(name: string, paramReplacements: DataType[] | null): void {
        let baseReplacements: BaseDataType<PrebuildTypes>[] | null;
        if (paramReplacements === null) {
            baseReplacements = null;
        } else {
            baseReplacements = paramReplacements.map((replacement) => replacement.base);
        }
        this.initWithBase(new BaseReferenceType<PrebuildTypes>(
            this,
            baseDeclarationMap,
            name,
            baseReplacements,
        ));
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        if (this.base.paramReplacements === null) {
            return this.base.name;
        } else {
            return `${this.base.name}<${this.base.paramReplacements.map((type) => type.parent.getNestedTypeCode(paramsAreUnknown)).join(", ")}>`;
        }
    }
    
    getNestedInstanceCode(): string {
        const resultText = [`(new ReferenceType<${this.getNestedTypeCode(true)}>()).init("${this.base.name}"`];
        const declaration = this.base.getDeclaration();
        if (declaration.paramTypeNames.length > 0) {
            const paramReplacements = this.base.getNonNullReplacements();
            const codeList = paramReplacements.map(
                (paramReplacement) => paramReplacement.parent.getNestedInstanceCode(),
            );
            resultText.push(`, [${codeList.join(", ")}]`);
        }
        resultText.push(")");
        return resultText.join("");
    }
}

abstract class LiteralType extends InitDataType {
    base: BaseLiteralType<PrebuildTypes>;
}

class AnyType extends LiteralType {
    base: BaseAnyType<PrebuildTypes>;
    
    initWithData(scope: Scope, data: LiteralTypeData): void {
        this.init();
    }
    
    init(): void {
        this.initWithBase(new BaseAnyType<PrebuildTypes>(this));
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return "any";
    }
    
    getNestedInstanceCode(): string {
        return "anyType";
    }
}

const anyType = new AnyType();
anyType.init();

class BoolType extends LiteralType {
    base: BaseBoolType<PrebuildTypes>;
    
    initWithData(scope: Scope, data: LiteralTypeData): void {
        this.init();
    }
    
    init(): void {
        this.initWithBase(new BaseBoolType<PrebuildTypes>(this));
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return "boolean";
    }
    
    getNestedInstanceCode(): string {
        return "boolType";
    }
}

class IntType extends LiteralType {
    base: BaseIntType<PrebuildTypes>;
    enumType: string | null;
    
    initWithData(scope: Scope, data: IntTypeData): void {
        const { enumType } = data;
        this.init(data.size, (typeof enumType === "undefined") ? null : enumType);
    }
    
    initEnumType(enumType: string | null): void {
        this.enumType = enumType;
    }
    
    init(size: number, enumType: string | null = null): void {
        this.initWithBase(new BaseIntType<PrebuildTypes>(this, size));
        this.initEnumType(enumType);
    }
    
    copyWithoutBase(): DataType {
        const output = new IntType();
        output.initEnumType(this.enumType);
        return output;
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return (this.enumType === null) ? "number" : this.enumType;
    }
    
    getNestedInstanceCode(): string {
        return `(new IntType()).init(${this.base.size})`;
    }
}

class StoragePointerType extends LiteralType {
    base: BaseStoragePointerType<PrebuildTypes>;
    
    initWithData(scope: Scope, data: PointerTypeData): void {
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType);
    }
    
    init(elementType: DataType): void {
        this.initWithBase(new BaseStoragePointerType<PrebuildTypes>(this, elementType.base));
    }
    
    getElementType(): DataType {
        return this.base.elementType.parent;
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return `StoragePointer<${this.getElementType().getNestedTypeCode(paramsAreUnknown)}>`;
    }
    
    getNestedInstanceCode(): string {
        return `(new StoragePointerType()).init(${this.getElementType().getNestedInstanceCode()})`;
    }
}

class BufferType extends LiteralType {
    base: BaseBufferType<PrebuildTypes>;
    
    initWithData(scope: Scope, data: BufferTypeData): void {
        this.init(data.size);
    }
    
    init(size: number): void {
        this.initWithBase(new BaseBufferType<PrebuildTypes>(this, size));
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return "Buffer";
    }
    
    getNestedInstanceCode(): string {
        return `(new BufferType()).init(${this.base.size})`;
    }
}

class ArrayType extends LiteralType {
    base: BaseArrayType<PrebuildTypes>;
    
    initWithData(scope: Scope, data: ArrayTypeData): void {
        const elementType = convertDataToType(scope, data.elementType);
        this.init(elementType, data.length);
    }
    
    init(elementType: DataType, length: number): void {
        this.initWithBase(new BaseArrayType<PrebuildTypes>(this, elementType.base, length));
    }
    
    getElementType(): DataType {
        return this.base.elementType.parent;
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return `${this.getElementType().getNestedTypeCode(paramsAreUnknown)}[]`;
    }
    
    getNestedInstanceCode(): string {
        return `(new ArrayType()).init(${this.getElementType().getNestedInstanceCode()}, ${this.base.length})`;
    }
}

abstract class Field {
    
    abstract getNestedTypeCode(paramsAreUnknown: boolean): string;
}

class MemberField extends Field implements ParentMemberField<PrebuildTypes> {
    base: BaseMemberField<PrebuildTypes>;
    
    initWithBase(base: BaseMemberField<PrebuildTypes>): void {
        this.base = base;
    }
    
    init(name: string, type: DataType): void {
        this.initWithBase(new BaseMemberField<PrebuildTypes>(this, name, type.base));
    }
    
    copyWithoutBase(): MemberField {
        return new (this.constructor as (new() => MemberField))();
    }
    
    getMemberType(): DataType {
        return this.base.type.parent;
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return `${this.base.name}: ${this.getMemberType().getNestedTypeCode(paramsAreUnknown)}`;
    }
    
    getNestedInstanceCode(): string {
        return `(new MemberField()).init("${this.base.name}", ${this.getMemberType().getNestedInstanceCode()})`;
    }
}

class FlavorField extends Field {
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return "_flavor?: { name: \"Struct\" }";
    }
}

class TailField extends Field {
    elementType: DataType;
    
    constructor(elementType: DataType) {
        super();
        this.elementType = elementType;
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        return `_tail: ${this.elementType.getNestedTypeCode(paramsAreUnknown)}[]`;
    }
}

class StructType extends LiteralType {
    base: BaseStructType<PrebuildTypes>;
    allFields: Field[];
    
    initWithBase(base: BaseDataType<PrebuildTypes>): void {
        super.initWithBase(base);
        this.allFields = null;
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
        const fields = data.fields.map((fieldData) => {
            const field = new MemberField();
            field.init(fieldData.name, convertDataToType(scope, fieldData.type));
            return field;
        });
        return { fields, superType };
    }
    
    initWithData(scope: Scope, data: StructTypeData): void {
        const { fields, superType } = this.initWithDataHelper(scope, data);
        this.init(fields, superType);
    }
    
    initFields(): void {
        this.allFields = [new FlavorField()];
        this.base.initFieldsIfMissing();
        this.base.memberFields.forEach((field) => {
            this.allFields.push(field.parent);
        });
    }
    
    initFieldsIfMissing(): void {
        if (this.allFields === null) {
            this.initFields();
        }
    }
    
    init(fields: MemberField[], superType: DataType | null = null): void {
        this.initWithBase(new BaseStructType<PrebuildTypes>(
            this,
            fields.map((field) => field.base),
            (superType === null) ? null : superType.base,
        ));
    }
    
    getSuperType(): DataType | null {
        const { superType } = this.base;
        return (superType === null) ? null : superType.parent;
    }
    
    getInterfaceName(): string {
        return "Struct";
    }
    
    getClassName(): string {
        return "StructType";
    }
    
    getConstructorArgs(): string[] {
        const superType = this.getSuperType();
        return (superType === null) ? [] : [superType.getNestedInstanceCode()];
    }
    
    getDeclarationTypeCode(name: string, paramTypeNames: string[]): string {
        const resultText: string[] = [];
        let extensionText = this.getInterfaceName();
        const superType = this.getSuperType();
        if (superType !== null) {
            extensionText += ", " + superType.getNestedTypeCode(false);
        }
        resultText.push(`export interface ${name}${getParamTypesCode(paramTypeNames)} extends ${extensionText} {`);
        for (const field of this.base.subTypeFields) {
            resultText.push(`    ${field.parent.getNestedTypeCode(false)};`);
        }
        resultText.push("}");
        return resultText.join("\n");
    }
    
    getDeclarationInstanceCode(name: string): string {
        const resultText: string[] = [`(new ${this.getClassName()}<${name}>()).init([`];
        for (const field of this.base.subTypeFields) {
            resultText.push(`    ${field.parent.getNestedInstanceCode()},`);
        }
        resultText.push(["]", ...this.getConstructorArgs()].join(", ") + ")");
        return resultText.join("\n");
    }
    
    getNestedTypeCode(paramsAreUnknown: boolean): string {
        this.initFieldsIfMissing();
        const fieldsCode = this.allFields.map(
            (field) => field.getNestedTypeCode(paramsAreUnknown),
        );
        return `{ ${fieldsCode.join(", ")} }`;
    }
    
    getNestedInstanceCode(): string {
        const fieldCodeList = this.base.subTypeFields.map(
            (field) => field.parent.getNestedInstanceCode(),
        );
        const resultText = [`(new ${this.getClassName()}()).init([${fieldCodeList.join(", ")}`];
        const terms = ["]", ...this.getConstructorArgs()];
        resultText.push(`${terms.join(", ")})`);
        return resultText.join("");
    }
}

class TailStructType extends StructType {
    base: BaseTailStructType<PrebuildTypes>;
    
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
    
    initFields(): void {
        super.initFields();
        this.initElementTypeIfMissing();
        this.allFields.push(new TailField(this.base.elementType.parent));
    }
    
    initElementTypeIfMissing(): void {
        this.base.initElementTypeIfMissing();
    }
    
    init(
        fields: MemberField[],
        superType: DataType | null = null,
        elementType: DataType | null = null,
    ): void {
        this.initWithBase(new BaseTailStructType<PrebuildTypes>(
            this,
            fields.map((field) => field.base),
            (superType === null) ? null : superType.base,
            (elementType === null) ? null : elementType.base,
        ));
    }
    
    getElementType(): DataType {
        this.initElementTypeIfMissing();
        return this.base.elementType.parent;
    }
    
    getInterfaceName(): string {
        return `TailStruct<${this.getElementType().getNestedTypeCode(false)}>`;
    }
    
    getClassName(): string {
        return "TailStructType";
    }
    
    getConstructorArgs(): string[] {
        return [
            ...super.getConstructorArgs(),
            this.getElementType().getNestedInstanceCode(),
        ];
    }
}

type InitTypeConstructor = new () => InitDataType;

const literalTypeMap: { [name: string]: InitTypeConstructor } = {
    AnyType, BoolType, IntType, BufferType, ArrayType, StoragePointerType, StructType, TailStructType,
};

class TypeDeclaration {
    base: BaseTypeDeclaration<PrebuildTypes>;
    
    initWithData(data: DeclarationData): void {
        let paramTypeNames = data.paramTypes;
        if (typeof paramTypeNames === "undefined") {
            paramTypeNames = [];
        }
        const scope = new Map<string, DataType>();
        paramTypeNames.forEach((name) => {
            const paramType = new ParamType();
            paramType.init(name);
            scope.set(name, paramType);
        });
        const type = convertDataToType(scope, data.type);
        this.init(data.name, type, paramTypeNames);
    }
    
    init(name: string, type: DataType, paramTypeNames: string[]): void {
        this.base = new BaseTypeDeclaration<PrebuildTypes>(
            this,
            name,
            type.base,
            paramTypeNames,
        );
    }
    
    getCode(): string {
        const { name, paramTypeNames } = this.base;
        const type = this.base.type.parent;
        const typeCode = type.getDeclarationTypeCode(name, paramTypeNames);
        const instanceCode = type.getDeclarationInstanceCode(name);
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
        const type = scope.get(data.name);
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

const resultText = ["\nimport { Struct, TailStruct } from \"./internalTypes.js\";\nimport { spanDegreeAmount, AllocType, ValueSlotType } from \"./constants.js\";\nimport { addTypeDeclaration, ParamType, ReferenceType, anyType, boolType, IntType, StoragePointerType, BufferType, ArrayType, MemberField, StructType, TailStructType } from \"./dataType.js\";\nimport { StoragePointer } from \"./storagePointer.js\";\n"];

const baseDeclarationMap = new Map<string, BaseTypeDeclaration<PrebuildTypes>>();
const typeDeclarations = typeDeclarationsData.map((data) => {
    const declaration = new TypeDeclaration();
    declaration.initWithData(data);
    return declaration;
});
typeDeclarations.forEach((declaration) => {
    baseDeclarationMap.set(declaration.base.name, declaration.base);
});
typeDeclarations.forEach((declaration) => {
    resultText.push(declaration.getCode());
});
resultText.push("\n");

const destinationPath = pathUtils.join(directoryPath, "..", "src", "builtTypes.ts");
fs.writeFileSync(destinationPath, resultText.join("\n"));


