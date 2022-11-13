
export const getWithDefault = <T1, T2 extends string & (keyof T1), T3>(
    dict: T1,
    key: T2,
    defaultValue: T3 = null,
): Required<T1>[T2] | T3 => {
    const value = dict[key];
    return (typeof value === "undefined") ? defaultValue : value;
};


