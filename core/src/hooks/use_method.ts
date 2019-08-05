import ld from "lodash";
import { serializeDom } from "../dom_serialize";
import { Handle } from "../handle";
import {
    AdaptElement,
    ElementPredicate,
    isApplyStyle,
    isMountedElement,
} from "../jsx";
import { useAsync } from "./use_async";

/**
 * Call an instance method on the Element that `hand` refers to.
 *
 * @remarks
 * This hook is the primary way for a function component to call an
 * instance method on another component element. A hook is used in order to delay
 * execution of the method until the DOM is completely built. The reason this
 * delayed execution is needed is because during the DOM build process, the
 * element that `hand` refers to may not have been built yet, or `hand` may
 * change to point to a different element later in the build process.
 * By waiting until this avoids element build order issues and ensures
 * that handle references are no longer changing.
 *
 * Because execution of the methods is delayed, `useMethod` will always return
 * the `initial` value on the initial build of a component. After every
 * DOM build is complete, the method will be invoked during the state update
 * phase and the return value stored in the component's state. This state
 * update (or any state update) will cause the DOM to build again. Upon
 * rebuild, the value stored from the last method invocation in the
 * component's state will be returned and a new invocation will be queued.
 *
 * If the value returned by the called method continues to change, this will
 * cause the DOM to continue to be rebuilt again.
 *
 * As this is a hook, it **must not** be called conditionally by a component.
 * In cases where a handle is not always present or the method should not be
 * called, call `useMethod` with `null` for `hand`.
 *
 * @param hand - The handle for the element upon which to call the method
 * `method`. `hand` may also be `null`, in which case, `initial` is always
 * the return value and the other arguments are ignored.
 *
 * @param initial - The initial value that `useMethod` will return before
 * execution of the method has occurred. This value will **always** be returned
 * on the first build of the component, when no component state is present.
 *
 * @param method - Name of the instance method to call.
 *
 * @param args - Variable arguments to be passed to the method call.
 */
export function useMethod<T>(hand: Handle | null, initial: T, method: string, ...args: any[]): T {
    return useAsync<T>(async () => {
        if (hand == null) return initial;
        return callInstanceMethod<T>(hand, initial, method, ...args);
    }, initial);
}

export function hasInstanceMethod(name: string, skip?: AdaptElement | null): ElementPredicate {
    return (el) => {
        if (el === skip) return false;
        if (!isMountedElement(el)) throw new Error(`Element is not an ElementImpl`);
        const inst = el.instance;
        return ld.isFunction(inst[name]);
    };
}

export function notReplacedByStyle(): ElementPredicate {
    return (el) => {
        if (!isMountedElement(el)) throw new Error(`Element is not an ElementImpl`);
        const succ = el.buildData.successor;
        if (succ == null) return true;
        if (!isApplyStyle(succ)) return true;
        return false;
    };
}

/**
 *  @beta
 *  Immediately call method on instance pointed to by handle
 */
export function callInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def, methodName);
    const mountedOrig = hand.associated ? hand.mountedOrig : null;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n` +
            ((mountedOrig != null) ? serializeDom(mountedOrig) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

/**
 * Immediately call a method on the successor instance of the one pointed to by handle.
 *
 *  @remarks
 * NOTE(mark): There are a couple differences between callNextInstanceMethod
 * and callInstanceMethod, all based on which predicate they pass to
 * getInstanceValue, either hasInstanceMethod or notReplacedByStyle.
 * - callInstance may use the instance from hand.mountedOrig where
 *   callNextInstance specifically skips it.
 * - callInstance may choose an instance that does not have the requested
 *   method, even though there may be an instance that has it in the chain.
 * - callInstance looks at buildData.successor to determine which elem
 *   to choose, but callNextInstance just relies on hand.nextMounted.
 *   I think ultimately buildData.successor can be replaced by just using
 *   hand.nextMounted everywhere.
 * - callInstance looks at whether a successor is an ApplyStyle,
 *   callNextInstance does not.
 * I think that we can probably move everything to use the hasInstanceMethod
 * predicate, with the only option being whether to skip hand.mountedOrig.
 *
 * @beta
 */
export function callNextInstanceMethod<T = any>(hand: Handle, def: T, methodName: string, ...args: any[]): T {
    if (!hand.associated) {
        // tslint:disable-next-line: max-line-length
        throw new Error(`Cannot find next instance when calling ${methodName}: handle is not associated with any element`);
    }
    // Skip hand.mountedOrig and start with its successor
    const method = getInstanceValue<(...args: any[]) => T>(hand, () => def,
        methodName, { pred: hasInstanceMethod(methodName, hand.mountedOrig) });
    const mountedOrig = hand.mountedOrig;
    if (!ld.isFunction(method)) {
        throw new Error(`${methodName} exists but is not a function on handle instance:\n` +
            ((mountedOrig != null) ? serializeDom(mountedOrig) : `mountedOrig is ${mountedOrig}`));
    }
    return method(...args);
}

export const defaultGetInstanceValueOptions: GetInstanceValueOptions = {
    pred: notReplacedByStyle(),
    throwOnNoElem: false
};

export interface GetInstanceValueOptions {
    pred?: ElementPredicate;
    throwOnNoElem?: boolean;
}

/**
 * Get the value of a field on an element instance
 *
 * @beta
 */
export function getInstanceValue<T = any>(hand: Handle, def: T, field: string, optionsIn?: GetInstanceValueOptions): T {
    const options = { ...defaultGetInstanceValueOptions, ...optionsIn };
    const pred = options.pred;
    if (!hand.associated) {
        if (!options.throwOnNoElem) return def;
        throw new Error(`Cannot get instance field ${field}: Handle is not associated with element`);
    }
    const elem = hand.nextMounted(pred);
    if (!elem) {
        if (!options.throwOnNoElem) return def;
        throw new Error(`Cannot get instance field ${field}: Handle does not point to mounted element`);
    }
    if (!elem.instance) {
        throw new Error(`Internal Error: Element is mounted but instance is ${elem.instance}`);
    }
    if (!(field in elem.instance)) {
        throw new Error(`${field} does not exist on handle instance:\n` + serializeDom(elem));
    }
    const val = elem.instance[field];
    if (ld.isFunction(val)) {
        return val.bind(elem.instance);
    }
    return val;
}

/**
 * Get the value of field from the instance referenced by handled instance.
 *
 * @remarks
 * On first invocation, or if the handle is not associated with an element, or the field is not found,
 * the value of `initial` will be returned.  After the element referenced by handle has been instantiated,
 * this hook will fetch the actual value of `field`, cause a rebuild, and then return that value
 * on the next call of the hook.
 *
 * @beta
 */
export function useInstanceValue<T>(hand: Handle, initial: T, field: string) {
    return useAsync<T>(async () => getInstanceValue(hand, initial, field), initial);
}