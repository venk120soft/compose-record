import { Map, Record } from 'immutable';
import isArray from 'is-array';
import isPlainObject from 'is-plain-obj';
import reduce from 'reduce';

const PROPS_KEY = '__@@DESCRIPTORS@@__';

function isPrimitiveType(input: any): boolean {
    return input === String ||
        input === Boolean ||
        input === Number;
}

function createTypeInstance(type: Type<any>, value?: any): any {
    if (!isPrimitiveType(type)) {
        const PropertyType = type as Class<any>;

        return new PropertyType(value);
    }

    const propertyFactory = type as TypeFunction<any>;

    // it's a primitive value
    // we'll use the factory to validate the type
    if (value) {
        return propertyFactory(value);
    }

    // value is not passed, getting a default value of a primitive type
    return propertyFactory();
}

function resolveGenericValue(desc?: TypeDescriptor<any>, value?: any): any {
    if (desc == null) {
        return value;
    }

    if (isArray(value)) {
        return value.map((gValue: any) => {
            if (desc.items == null) {
                return createTypeInstance(desc.type, gValue);
            }

            return createTypeInstance(desc.type, resolveGenericValue(desc.items, gValue));
        });
    }

    if (isPlainObject(value)) {
        return reduce(value, (res: any, gValue: any, gField: string) => {
            const out = res;
            let resolved;

            if (desc.items == null) {
                resolved = createTypeInstance(desc.type, gValue);
            } else {
                resolved = createTypeInstance(desc.type, resolveGenericValue(desc.items, gValue));
            }

            out[gField] = resolved;

            return out;
        },            {});
    }

    return value || desc.defaultValue;
}

function createPropertyInstance(prop: Property<any>, value?: any): any {
    if (prop.items == null || value == null) {
        if (value == null) {
            if (prop.nullable) {
                return null;
            }
        }

        return createTypeInstance(prop.type, value || prop.defaultValue);
    }

    return createTypeInstance(prop.type, resolveGenericValue(prop.items, value));
}

function getPropertyDescriptors(type: Type<Immutable>): PropertyCollection | undefined {
    return (type as any)[PROPS_KEY];
}

function createClass(name: string, props: PropertyCollection, values: any): any {
    const _RecordType = Record(values, name);

    // tslint:disable-next-line:typedef
    function RecordType(v?: Values) {
        const values = reduce(props, (res: any, field: Property<any>, fName: string) => {
            const out = res;

            out[fName] = createPropertyInstance(field, v ? v[fName] : undefined);

            return out;
        },                    {});

        return _RecordType(values);
    }

    (RecordType as any)[PROPS_KEY] = props;
    (RecordType as any).getPropertyDescriptors = function () {
        return getPropertyDescriptors(RecordType);
    };
    RecordType.prototype = _RecordType.prototype;
    RecordType.prototype.constructor = RecordType;

    return RecordType as any;
}

export interface Class<TOut = any, TIn = any> {
    [prop: string]: any;
    name: string;
    new (values?: TIn): TOut;
    getPropertyDescriptors(): Readonly<PropertyCollection>;
}

export interface Immutable extends Map<string, any> {}

export interface Values {
    [prop: string]: any;
}

export type TypeFunction<T> = (value?: any) => T;

export type Type<T> = Class<T> | TypeFunction<T>;

export interface TypeDescriptor<T> {
    type: Type<T>;
    defaultValue?: any;
    items?: TypeDescriptor<T>;
}

export interface Property<T> extends TypeDescriptor<T> {
    nullable?: boolean;
}

export interface PropertyCollection {
    [name: string]: Property<any>;
}

export interface ComposeOptions {
    name: string;
    properties?: PropertyCollection;
    extends?: Type<any> | Type<any>[];
}

/* 
 * Creates a deeply nested Record class.
 */
export function compose<
    TDef,
    TArgs = TDef
>(opts: ComposeOptions): Class<TDef & Immutable, TArgs> {
    let propTypes: PropertyCollection = opts.properties ?  { ...opts.properties } : {};

    if (opts.extends) {
        const ext: Type<any>[] = isArray(opts.extends) ? opts.extends : [opts.extends];

        // iterate over extending types
        ext.forEach((type: Type<Immutable>) => {
            if (!isPrimitiveType(type)) {
                const props = getPropertyDescriptors(type);

                // if it's an immutable, serialize the value and mix with others
                if (props != null) {
                    propTypes = { ...propTypes, ...props };
                } else {
                    // tslint:disable-next-line:max-line-length
                    console.warn('Passed a non-composed data structure as extending type. Only composed Records are supported.');
                }
            } else {
                console.warn('Passed a primitive type. Primitives cannot extend Record type');
            }
        });
    }

    const propValues = reduce(propTypes, (res: any, prop: Property<any>, name: string) => {
        const out = res;

        // set record prop type
        propTypes[name] = prop;

        // set prop default value
        out[name] = createTypeInstance(prop.type, prop.defaultValue);

        return out;
    },                        {});

    return createClass(
        opts.name,
        Object.freeze(propTypes),
        propValues,
    );
}
