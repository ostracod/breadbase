
export interface ParentDataType<T extends ParentTypes> {
    copyWithoutBase(): T["dataType"];
    initWithBase(base: BaseDataType<T>): void;
    getAnyType(): BaseAnyType<T>;
}

export interface ParentMemberField<T extends ParentTypes> {
    copyWithoutBase(): T["memberField"];
    initWithBase(base: BaseMemberField<T>): void;
}

export interface ParentTypeDeclaration<T extends ParentTypes> {
    copyWithoutBase(): T["typeDeclaration"];
    initWithBase(base: BaseTypeDeclaration<T>): void;
}

export interface ParentTypes {
    dataType: ParentDataType<ParentTypes>;
    memberField: ParentMemberField<ParentTypes>;
    typeDeclaration: ParentTypeDeclaration<ParentTypes>;
}

export type BaseParamMap<T extends ParentTypes> = Map<string, BaseDataType<T>>;

export abstract class BaseDataType<T extends ParentTypes> {
    parent: T["dataType"];
    
    constructor(parent: T["dataType"]) {
        this.parent = parent;
    }
    
    abstract dereference(): BaseLiteralType<T>;
    
    abstract replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T>;
}

export class BaseParamType<T extends ParentTypes> extends BaseDataType<T> {
    name: string;
    
    constructor(parent: T["dataType"], name: string) {
        super(parent);
        this.name = name;
    }
    
    dereference(): BaseLiteralType<T> {
        throw new Error(`Cannot dereference parameter type "${this.name}".`);
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const replacement = paramMap.get(this.name);
        if (typeof replacement === "undefined") {
            return this as unknown as BaseDataType<T>;
        } else {
            return replacement;
        }
    }
}

export class BaseReferenceType<T extends ParentTypes> extends BaseDataType<T> {
    declarationMap: Map<string, BaseTypeDeclaration<T>>;
    name: string;
    paramReplacements: BaseDataType<T>[] | null;
    
    constructor(
        parent: T["dataType"],
        declarationMap: Map<string, BaseTypeDeclaration<T>>,
        name: string,
        paramReplacements: BaseDataType<T>[],
    ) {
        super(parent);
        this.declarationMap = declarationMap;
        this.name = name;
        this.paramReplacements = paramReplacements;
    }
    
    getDeclaration(): BaseTypeDeclaration<T> {
        return this.declarationMap.get(this.name);
    }
    
    getNonNullReplacements(): BaseDataType<T>[] {
        if (this.paramReplacements === null) {
            const anyType = this.parent.getAnyType() as BaseAnyType<T>;
            return this.getDeclaration().paramTypeNames.map((name) => anyType);
        } else {
            return this.paramReplacements;
        }
    }
    
    dereference(): BaseLiteralType<T> {
        const declaration = this.getDeclaration();
        let { type } = declaration;
        const paramMap = new Map<string, BaseDataType<T>>();
        this.getNonNullReplacements().forEach((paramReplacement, index) => {
            const name = declaration.paramTypeNames[index];
            paramMap.set(name, paramReplacement);
        });
        type = type.replaceParamTypes(paramMap);
        return type.dereference();
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        let replacements: BaseDataType<T>[] | null;
        if (this.paramReplacements === null) {
            replacements = null;
        } else {
            replacements = this.paramReplacements.map((replacement) => (
                replacement.replaceParamTypes(paramMap)
            ));
        }
        const parent = this.parent.copyWithoutBase();
        const output = new BaseReferenceType<T>(
            parent,
            this.declarationMap,
            this.name,
            replacements,
        );
        parent.initWithBase(output);
        return output;
    }
}

export abstract class BaseLiteralType<T extends ParentTypes> extends BaseDataType<T> {
    
    dereference(): BaseLiteralType<T> {
        return this as unknown as BaseLiteralType<T>;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        return this as unknown as BaseLiteralType<T>;
    }
}

export class BaseAnyType<T extends ParentTypes> extends BaseLiteralType<T> {
    
}

export class BaseBoolType<T extends ParentTypes> extends BaseLiteralType<T> {
    
}

export class BaseIntType<T extends ParentTypes> extends BaseLiteralType<T> {
    size: number;
    
    constructor(parent: T["dataType"], size: number) {
        super(parent);
        this.size = size;
    }
}

export class BaseArrayType<T extends ParentTypes> extends BaseLiteralType<T> {
    elementType: BaseDataType<T>;
    length: number;
    
    constructor(parent: T["dataType"], elementType: BaseDataType<T>, length: number) {
        super(parent);
        this.elementType = elementType;
        this.length = length;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        const parent = this.parent.copyWithoutBase();
        const output = new BaseArrayType<T>(parent, elementType, this.length);
        parent.initWithBase(output);
        return output;
    }
}

export class BaseStoragePointerType<T extends ParentTypes> extends BaseLiteralType<T> {
    elementType: BaseDataType<T>;
    
    constructor(parent: T["dataType"], elementType: BaseDataType<T>) {
        super(parent);
        this.elementType = elementType;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        const parent = this.parent.copyWithoutBase();
        const output = new BaseStoragePointerType<T>(parent, elementType);
        parent.initWithBase(output);
        return output;
    }
}

export class BaseMemberField<T extends ParentTypes> {
    parent: T["memberField"];
    name: string;
    type: BaseDataType<T>;
    
    constructor(parent: T["memberField"], name: string, type: BaseDataType<T>) {
        this.parent = parent;
        this.name = name;
        this.type = type;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseMemberField<T> {
        const type = this.type.replaceParamTypes(paramMap);
        const parent = this.parent.copyWithoutBase();
        const output = new BaseMemberField<T>(parent, this.name, type);
        parent.initWithBase(output);
        return output;
    }
}

export class BaseStructType<T extends ParentTypes> extends BaseLiteralType<T> {
    subTypeFields: BaseMemberField<T>[];
    superType: (BaseDataType<T>) | null;
    memberFields: BaseMemberField<T>[] | null;
    
    constructor(
        parent: T["dataType"],
        fields: BaseMemberField<T>[],
        superType: BaseDataType<T> | null,
    ) {
        super(parent);
        this.subTypeFields = fields;
        this.superType = superType;
        this.memberFields = null;
    }
    
    initFieldsIfMissing(): void {
        if (this.memberFields !== null) {
            return;
        }
        this.memberFields = [];
        if (this.superType !== null) {
            const structType = this.superType.dereference() as BaseStructType<T>;
            structType.memberFields.forEach((field) => {
                this.memberFields.push(field);
            });
        }
        this.subTypeFields.forEach((field) => {
            this.memberFields.push(field);
        });
    }
    
    replaceParamsHelper(
        paramMap: BaseParamMap<T>,
    ): { fields: BaseMemberField<T>[], superType: BaseDataType<T> | null } {
        const fields = this.subTypeFields.map((field) => (
            field.replaceParamTypes(paramMap)
        ));
        let superType: BaseDataType<T> | null;
        if (this.superType === null) {
            superType = null;
        } else {
            superType = this.superType.replaceParamTypes(paramMap);
        }
        return { fields, superType };
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const { fields, superType } = this.replaceParamsHelper(paramMap);
        const parent = this.parent.copyWithoutBase();
        const output = new BaseStructType<T>(parent, fields, superType);
        parent.initWithBase(output);
        return output;
    }
}

export class BaseTailStructType<T extends ParentTypes> extends BaseStructType<T> {
    uninheritedElementType: BaseDataType<T> | null;
    elementType: BaseDataType<T> | null;
    
    constructor(
        parent: T["dataType"],
        fields: BaseMemberField<T>[],
        superType: BaseDataType<T> | null = null,
        elementType: BaseDataType<T> | null = null,
    ) {
        super(parent, fields, superType);
        this.uninheritedElementType = elementType;
        this.elementType = null;
    }
    
    initElementTypeIfMissing(): void {
        if (this.uninheritedElementType === null) {
            this.elementType = (this.superType.dereference() as BaseTailStructType<T>).elementType;
        } else {
            this.elementType = this.uninheritedElementType;
        }
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const { fields, superType } = this.replaceParamsHelper(paramMap);
        let elementType: BaseDataType<T> | null;
        if (this.uninheritedElementType === null) {
            elementType = null;
        } else {
            elementType = this.uninheritedElementType.replaceParamTypes(paramMap);
        }
        const parent = this.parent.copyWithoutBase();
        const output = new BaseTailStructType<T>(parent, fields, superType, elementType);
        parent.initWithBase(output);
        return output;
    }
}

export class BaseTypeDeclaration<T extends ParentTypes> {
    parent: T["typeDeclaration"];
    name: string;
    type: BaseDataType<T>;
    paramTypeNames: string[];
    
    constructor(
        parent: T["typeDeclaration"],
        name: string,
        type: BaseDataType<T>,
        paramTypeNames: string[],
    ) {
        this.parent = parent;
        this.name = name;
        this.type = type;
        this.paramTypeNames = paramTypeNames;
    }
}


