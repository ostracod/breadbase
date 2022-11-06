
type BaseParamMap<T> = Map<string, BaseDataType<T> & T>;

// Subclasses of BaseDataType must conform to T.
export abstract class BaseDataType<T = any> {
    
    abstract dereference(): BaseLiteralType<T> & T;
    
    abstract replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T;
}

export class BaseParamType<T> extends BaseDataType<T> {
    name: string;
    
    constructor(name: string) {
        super();
        this.name = name;
    }
    
    dereference(): BaseLiteralType<T> & T {
        throw new Error(`Cannot dereference parameter type "${this.name}".`);
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        const replacement = paramMap.get(this.name);
        if (typeof replacement === "undefined") {
            return this as unknown as BaseDataType<T> & T;
        } else {
            return replacement;
        }
    }
}

export class BaseReferenceType<T> extends BaseDataType<T> {
    declarationMap: Map<string, BaseTypeDeclaration<T>>;
    name: string;
    paramReplacements: (BaseDataType<T> & T)[] | null;
    
    init(
        // "Any" must be defined in declarationMap as an instance of BaseAnyType<T> & T.
        declarationMap: Map<string, BaseTypeDeclaration<T>>,
        name: string,
        paramReplacements: (BaseDataType<T> & T)[],
    ): void {
        this.declarationMap = declarationMap;
        this.name = name;
        this.paramReplacements = paramReplacements;
    }
    
    getDeclaration(): BaseTypeDeclaration<T> {
        return this.declarationMap.get(this.name);
    }
    
    getAnyType(): BaseAnyType<T> & T {
        return this.declarationMap.get("Any").type as BaseAnyType<T> & T;
    }
    
    getNonNullReplacements(): (BaseDataType<T> & T)[] {
        if (this.paramReplacements === null) {
            return this.getDeclaration().paramTypeNames.map((name) => this.getAnyType());
        } else {
            return this.paramReplacements;
        }
    }
    
    dereference(): BaseLiteralType<T> & T {
        const declaration = this.getDeclaration();
        let { type } = declaration;
        const paramMap = new Map<string, BaseDataType<T> & T>();
        this.getNonNullReplacements().forEach((paramReplacement, index) => {
            const name = declaration.paramTypeNames[index];
            paramMap.set(name, paramReplacement);
        });
        type = type.replaceParamTypes(paramMap);
        return type.dereference();
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        let replacements: (BaseDataType<T> & T)[] | null;
        if (this.paramReplacements === null) {
            replacements = null;
        } else {
            replacements = this.paramReplacements.map((replacement) => (
                replacement.replaceParamTypes(paramMap)
            ));
        }
        const output = new (this.constructor as new() => (BaseReferenceType<T> & T))();
        output.init(this.declarationMap, this.name, replacements);
        return output;
    }
}

export abstract class BaseLiteralType<T> extends BaseDataType<T> {
    
    dereference(): BaseLiteralType<T> & T {
        return this as unknown as BaseLiteralType<T> & T;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        return this as unknown as BaseLiteralType<T> & T;
    }
}

export class BaseAnyType<T> extends BaseLiteralType<T> {
    
}

export class BaseBoolType<T> extends BaseLiteralType<T> {
    
}

export class BaseIntType<T> extends BaseLiteralType<T> {
    size: number;
    
    init(size: number): void {
        this.size = size;
    }
}

export class BaseArrayType<T> extends BaseLiteralType<T> {
    elementType: BaseDataType<T> & T;
    length: number;
    
    init(elementType: BaseDataType<T> & T, length: number): void {
        this.elementType = elementType;
        this.length = length;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        const output = new (this.constructor as new() => (BaseArrayType<T> & T))();
        output.init(elementType, this.length);
        return output;
    }
}

export class BaseStoragePointerType<T> extends BaseLiteralType<T> {
    elementType: BaseDataType<T> & T;
    
    init(elementType: BaseDataType<T> & T): void {
        this.elementType = elementType;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        const elementType = this.elementType.replaceParamTypes(paramMap);
        const output = new (this.constructor as new() => (BaseStoragePointerType<T> & T))();
        output.init(elementType);
        return output;
    }
}

export class BaseMemberField<T> {
    name: string;
    type: BaseDataType<T> & T;
    
    init(name: string, type: BaseDataType<T> & T): void {
        this.name = name;
        this.type = type;
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseMemberField<T> {
        const type = this.type.replaceParamTypes(paramMap);
        const output = new (this.constructor as new() => (BaseMemberField<T> & T))();
        output.init(this.name, type);
        return output;
    }
}

export class BaseStructType<T> extends BaseLiteralType<T> {
    subTypeFields: BaseMemberField<T>[];
    superType: (BaseDataType<T> & T) | null;
    memberFields: BaseMemberField<T>[] | null;
    
    initFieldsIfMissing(): void {
        if (this.memberFields !== null) {
            return;
        }
        this.memberFields = [];
        if (this.superType !== null) {
            const structType = this.superType.dereference() as BaseStructType<T> & T;
            structType.memberFields.forEach((field) => {
                this.addMemberField(field);
            });
        }
        this.subTypeFields.forEach((field) => {
            this.addMemberField(field);
        });
    }
    
    initStruct(fields: BaseMemberField<T>[], superType: (BaseDataType<T> & T) | null): void {
        this.subTypeFields = fields;
        this.superType = superType;
        this.memberFields = null;
    }
    
    init(fields: BaseMemberField<T>[], superType: (BaseDataType<T> & T) | null = null): void {
        this.initStruct(fields, superType);
    }
    
    addMemberField(field: BaseMemberField<T>): void {
        this.memberFields.push(field);
    }
    
    replaceParamsHelper(paramMap: BaseParamMap<T>, structType: BaseStructType<T>): void {
        const fields = this.subTypeFields.map((field) => (
            field.replaceParamTypes(paramMap)
        ));
        let superType: (BaseDataType<T> & T) | null;
        if (this.superType === null) {
            superType = null;
        } else {
            superType = this.superType.replaceParamTypes(paramMap);
        }
        structType.initStruct(fields, superType);
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        const output = new (this.constructor as new() => (BaseStructType<T> & T))();
        this.replaceParamsHelper(paramMap, output);
        return output;
    }
}

export class BaseTailStructType<T> extends BaseStructType<T> {
    uninheritedElementType: (BaseDataType<T> & T) | null;
    elementType: (BaseDataType<T> & T) | null;
    
    initElementTypeIfMissing(): void {
        if (this.uninheritedElementType === null) {
            this.elementType = (this.superType.dereference() as BaseTailStructType<T> & T).elementType;
        } else {
            this.elementType = this.uninheritedElementType;
        }
    }
    
    initTailStruct(elementType: (BaseDataType<T> & T) | null): void {
        this.uninheritedElementType = elementType;
        this.elementType = null;
    }
    
    init(
        fields: BaseMemberField<T>[],
        superType: (BaseDataType<T> & T) | null = null,
        elementType: (BaseDataType<T> & T) | null = null,
    ): void {
        this.initStruct(fields, superType);
        this.initTailStruct(elementType);
    }
    
    replaceParamTypes(paramMap: BaseParamMap<T>): BaseDataType<T> & T {
        let elementType: (BaseDataType<T> & T) | null;
        if (this.uninheritedElementType === null) {
            elementType = null;
        } else {
            elementType = this.uninheritedElementType.replaceParamTypes(paramMap);
        }
        const output = new (this.constructor as new() => (BaseTailStructType<T> & T))();
        this.replaceParamsHelper(paramMap, output);
        output.initTailStruct(elementType);
        return output;
    }
}

export class BaseTypeDeclaration<T> {
    name: string;
    type: BaseDataType<T> & T;
    paramTypeNames: string[];
    
    constructor(name: string, type: BaseDataType<T> & T, paramTypeNames: string[]) {
        this.name = name;
        this.type = type;
        this.paramTypeNames = paramTypeNames;
    }
}


