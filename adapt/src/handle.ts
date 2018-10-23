import { AdaptElement, isMountedElement, KeyPath } from "./jsx";
import { findMummyUrn, registerObject } from "./reanimate";

export interface Handle {
    readonly target: AdaptElement | null;
    readonly name?: string;
    replaceTarget(child: AdaptElement | null): void;
}

export function isHandle(val: unknown): val is Handle {
    return val instanceof HandleImpl;
}

export interface HandleInternal extends Handle {
    targetReplaced: boolean;
    unresolvedTarget?: KeyPath | null;

    associate(el: AdaptElement): void;
}

export function isHandleInternal(val: unknown): val is HandleInternal {
    return val instanceof HandleImpl;
}

export function getInternalHandle(el: AdaptElement): HandleInternal {
    const hand = el.props.handle;
    if (!isHandleInternal(hand)) throw new Error(`Internal error: handle is not a HandleImpl`);
    return hand;
}

let nextId = 0;

const id = Symbol.for("AdaptHandleId");
const origElement = Symbol.for("AdaptHandleOrigElement");

interface HandleOptions {
    name?: string;
    target?: KeyPath;
}

class HandleImpl implements HandleInternal {
    readonly name?: string;
    unresolvedTarget?: KeyPath | null;
    [origElement]?: AdaptElement | null;
    [id]: number; // For debugging

    // childElement is:
    //   a) undefined before origElement is associated & built
    //   b) undefined if handle was reanimated
    //   c) an Element if origElement's build replaced with another Element
    //   d) null if there's no longer an Element in the final DOM that
    //      corresponds to this handle.
    childElement?: AdaptElement | null;

    constructor(opts: HandleOptions) {
        this[id] = nextId++;

        if (opts.name) this.name = opts.name;

        if (opts.target !== undefined) {
            this.unresolvedTarget = opts.target;
            if (opts.target === null) this.associate(null);
        }
    }

    associate = (el: AdaptElement | null) => {
        const orig = this[origElement];
        if (orig !== undefined) {
            const path = isMountedElement(orig) ? orig.path : "<not mounted>";
            throw new Error(
                `Cannot associate a Handle with more than one AdaptElement. ` +
                `Original element type ${orig && orig.componentType.name}, ` +
                `path: ${path}, ` +
                `second association element type ${el && el.componentType.name}`);
        }
        this[origElement] = el;
    }

    replaceTarget = (el: AdaptElement | null) => {
        if (this.targetReplaced) {
            throw new Error(`Cannot call replaceTarget on a Handle more than once`);
        }
        // Replacing with origElement doesn't modify anything (and importantly,
        // doesn't create a loop for target).
        if (el === this[origElement]) return;

        this.childElement = el;
    }

    get targetReplaced(): boolean {
        return this.childElement !== undefined;
    }

    get id() {
        return this[id];
    }

    get target(): AdaptElement | null {
        // tslint:disable-next-line:no-this-assignment
        let hand: HandleImpl = this;
        while (true) {
            const orig = hand[origElement];
            if (orig === undefined) {
                throw new Error(`This handle was never associated with an AdaptElement`);
            }
            if (hand.childElement === undefined) return orig;

            // Null child means no Element is present for this handle in
            // the final DOM.
            if (hand.childElement === null) return null;

            const childHand = hand.childElement.props.handle;
            if (childHand == null) {
                throw new Error(`Internal error: no Handle present on Element in child chain`);
            }
            if (!(childHand instanceof HandleImpl)) {
                throw new Error(`Internal error: Handle present on Element is not a HandleImpl`);
            }

            hand = childHand;
        }
    }

    toString() {
        return `Handle(${this.id})`;
    }

    toJSON() {
        const el = this.target;
        const target = isMountedElement(el) ? el.keyPath : null;

        return {
            name: this.name,
            target,
        };
    }
}

/**
 * User-facing API for creating a Handle
 * @param name Name to associate with the handle for debugging/display purposes
 */
export function handle(name?: string): Handle {
    return new HandleImpl({name});
}

registerObject(HandleImpl, "HandleImpl", module);

export const handleUrn = findMummyUrn(HandleImpl);