// todo: move this into util.ts when util becomes ts

// NOTE: I won't be using this, as `Map` uses reference-equality for 
export class SafeMap<TK, TV> extends Map<TK, TV> {
    constructor() {
        super();
    }
    checkedGet(key : TK) : TV {
        if(!super.has(key))
            throw "lxError";
        return super.get(key)!;
    }
}