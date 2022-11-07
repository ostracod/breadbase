
export type BaseParamMap<T> = Map<string, BaseDataType<T>>;

export abstract class BaseDataType<T> {
    parent: T;
    
    abstract dereference(): BaseLiteralType<T>;
    
    abstract replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T>;
}

export class BaseParamType<T> extends BaseDataType<T> {
    name: string;
    
    constructor(name: string) {
        super();
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

export class BaseReferenceType<T> extends BaseDataType<T> {
    declarationMap: Map<string, BaseTypeDeclaration<T>>;
    name: string;
    paramReplacements: BaseDataType<T>[] | null;
    
    constructor(
        // "Any" must be defined in declarationMap as an instance of BaseAnyType<T>.
        declarationMap: Map<string, BaseTypeDeclaration<T>>,
        name: string,
        paramReplacements: BaseDataType<T>[],
    ) {
        super();
        this.declarationMap = declarationMap;
        this.name = name;
        this.paramReplacements = paramReplacements;
    }
    
    getDeclaration(): BaseTypeDeclaration<T> {
        return this.declarationMap.get(this.name);
    }
    
    getAnyType(): BaseAnyType<T> {
        return this.declarationMap.get("Any").type as BaseAnyType<T>;
    }
    
    getNonNullReplacements(): BaseDataType<T>[] {
        if (this.paramReplacements === null) {
            return this.getDeclaration().paramTypeNames.map((name) => this.getAnyType());
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
        return new BaseReferenceType<T>(this.declarationMap, this.name, replacements);
    }
}

export abstract class BaseLiteralType<T> extends BaseDataType<T> {
    
    dereference(): BaseLiteralType<T> {
        return this as unknown as BaseLiteralType<T>;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        return this as unknown as BaseLiteralType<T>;
    }
}

export class BaseAnyType<T> extends BaseLiteralType<T> {
    
}

export class BaseBoolType<T> extends BaseLiteralType<T> {
    
}

export class BaseIntType<T> extends BaseLiteralType<T> {
    size: number;
    
    constructor(size: number) {
        super();
        this.size = size;
    }
}

export class BaseArrayType<T> extends BaseLiteralType<T> {
    elementType: BaseDataType<T>;
    length: number;
    
    constructor(elementType: BaseDataType<T>, length: number) {
        super();
        this.elementType = elementType;
        this.length = length;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        return new BaseArrayType<T>(elementType, this.length);
    }
}

export class BaseStoragePointerType<T> extends BaseLiteralType<T> {
    elementType: BaseDataType<T>;
    
    constructor(elementType: BaseDataType<T>) {
        super();
        this.elementType = elementType;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        return new BaseStoragePointerType<T>(elementType);
    }
}

export class BaseMemberField<T> {
    parent: T;
    name: string;
    type: BaseDataType<T>;
    
    constructor(name: string, type: BaseDataType<T>) {
        this.name = name;
        this.type = type;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseMemberField<T> {
        const type = this.type.replaceParamTypes(paramMap);
        return new BaseMemberField<T>(this.name, type);
    }
}

export class BaseStructType<T> extends BaseLiteralType<T> {
    subTypeFields: BaseMemberField<T>[];
    superType: (BaseDataType<T>) | null;
    memberFields: BaseMemberField<T>[] | null;
    
    constructor(fields: BaseMemberField<T>[], superType: BaseDataType<T> | null) {
        super();
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
        return new BaseStructType<T>(fields, superType);
    }
}

export class BaseTailStructType<T> extends BaseStructType<T> {
    uninheritedElementType: BaseDataType<T> | null;
    elementType: BaseDataType<T> | null;
    
    constructor(
        fields: BaseMemberField<T>[],
        superType: BaseDataType<T> | null = null,
        elementType: BaseDataType<T> | null = null,
    ) {
        super(fields, superType);
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
        return new BaseTailStructType<T>(fields, superType, elementType);
    }
}

export class BaseTypeDeclaration<T> {
    parent: T;
    name: string;
    type: BaseDataType<T>;
    paramTypeNames: string[];
    
    constructor(name: string, type: BaseDataType<T>, paramTypeNames: string[]) {
        this.name = name;
        this.type = type;
        this.paramTypeNames = paramTypeNames;
    }
}


