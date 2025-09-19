# Native promise adoption

ECMAScript proposal for adopting the state of native promises without using their `.then`.

## Status

[The TC39 Process](https://tc39.es/process-document/)

**Stage**: 0

**Champions**:
- Mathieu Hofman ([@mhofman](https://github.com/mhofman)) (Agoric)

## Motivation

Currently, native promises are already adopted in the [`Await`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#await) case (introduced in https://github.com/tc39/ecma262/pull/1250) and [`AsyncFromSyncIteratorContinuation`](https://tc39.es/ecma262/#sec-asyncfromsynciteratorcontinuation), ignoring any own `.then` or modified `Promise.prototype.then`. The `Await` AO is internally used not only for the `await` syntax, but also in the [`Array.fromAsync`](https://github.com/tc39/proposal-array-from-async) API, and some of the [async iterator helpers](https://github.com/tc39/proposal-async-iterator-helpers).

On the other hand, the [promise resolve functions](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-resolve-functions) do not attempt to recognize whether the resolution value is a native promise and always take the `.then` path assimilating the value. This behavior is observable not only when using APIs obviously related to the resolver functions (e.g. `new Promise()` / `Promise.withResolvers()`), but also anywhere the spec relies on [PromiseCapability records](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promisecapability-records), including `return` in async functions.

This results in inconsistent behavior in the spec where some syntax and APIs adopt the native promise internal state without triggering `.then` machinery, and other syntax and APIs assimilate through `.then`.

### Note on adoption bailout and fallback to `.then`

`Await` and similar operations performing native promise adoption first obtain an intrinsic `%Promise%` from the value, and adopt that promise. For that they rely on the [`PromiseResolve` AO](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-resolve), which passes through the value if it is a native promise (satisfying the [`IsPromise`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-ispromise) check), and the `.constructor` of the native promise value matches `%Promise%`. That latter check is actually prone to interference by user code, which can currently force the creation of a new promise by polluting `%Promise.prototype%.constructor`, triggering the assimilation of the value instead. https://github.com/tc39/ecma262/pull/3689 aims to change that check to a `[[GetPrototypeOf]]` based check which is not subject to such interferences, guaranteeing that native promise values are always adopted in those operations.

## Proposal

The Promises/A+ specification allows and actually [expects promise implementations to recognize their own instances](https://promisesaplus.com/#point-49), and adopt their state without using the `.then` machinery.

This proposal implements that adoption, for native promises that are a base promise identified as having a `%Promise.prototype%` proto. This matches the intent of `Await` and `PromiseResolve` to continue using the `.then` mechanism for derived promises, and the proposed semantics of https://github.com/tc39/ecma262/pull/3689 to use a prototype based check not subject to pollution.

If wholesale adoption through resolve functions is not web compatible, the proposal would pivot to at least changing the semantics of `return` in async functions to perform an adoption (solving issue https://github.com/tc39/ecma262/issues/2770).

## Relation to other PRs and proposals

Combined with https://github.com/tc39/ecma262/pull/3689, this proposal guarantees that no user code is executed when adopting a base native promise (of the same realm), whether it's `await`-ing or `return`-ing  the result value of a call to another async function.

This proposal does not change the way non promise thenables are handled, including when the resolution values are "unexpected thenables" (see [thenable curtailment proposal](https://github.com/tc39/proposal-thenable-curtailment)). It does however enable some mitigations such as guaranteeing that if a thenable fulfillment is ever possible, such fulfillment value would be adopted through a chain of native promises without unwrapping.

This PR does not make any changes to the number of tick / jobs for resolving promises, leaving that potential optimization to the existing [faster promise adoption proposal](https://github.com/tc39/proposal-faster-promise-adoption). It does reduce the scope of that proposal to focus on the number of jobs observable only by counting ticks when adopting promises, and potentially to better detect promise resolution cycles.

## Web compatibility

Code today already cannot reliably rely on hijacking a promise `.then` to detect when the outcome of a promise is used, since `await` performs an internal `PerformPromiseThen`. However there seems to be some applications that rely on transpilation of async/await to avoid this adoption behavior. Some libraries like [`zone.js`](https://www.npmjs.com/package/zone.js) do rely on hijacking `Promise.prototype.then`, and while being deprecated, they are still widely used on the web.

For confirmation, we could instrument an existing implementation to detect how often a custom `.then` behavior would be ignored by this proposed promise adoption. If the resolution value has a `.then` function, implementations would need to check whether the resolution is a native promise with a `%Promise.prototype%` proto. This defines the set of "adoptable promises". Of this set the affected cases would be if the `then` function does not match `%Promise.prototype.then%`, or if obtaining the `then` function triggered user code.

Alternatives may be to reduce the scope of promise adoption to syntax directed operations such as `return` in async functions, or require an opt-in from the application.

## Userland "safe" promise capability

It is possible to leverage the adoption semantics in await syntax to create a `SafePromise` constructor whose resolver does not trigger the `.then` machinery for native promises.

```js
const makePromiseKit = Promise.withResolvers.bind(Promise);

async function makePromise(executor) {
  const {promise, resolve} = makePromiseKit();

  executor(
    value => resolve({__proto__: null, status: 'resolved', value}),
    reason => resolve({__proto__: null, status: 'rejected', reason}),
  );

  const resolution = await promise;

  if (resolution.status === 'resolved') {
    return await resolution.value;
  } else {
    throw resolution.reason;
  }
}

function SafePromise(executor) {
  if (new.target !== SafePromise) throw TypeError();

  return makePromise(executor);
}
Object.setPrototypeOf(SafePromise, Promise);
Object.defineProperty(SafePromise, 'prototype', {value: Promise.prototype, writable: false});
```

This however wouldn't affect promise capabilities internal to the spec or the host that are created directly from the `%Promise%` constructor.

Some intrinsics rely on a regular species mechanism to construct promise capabilities for their results, and would only be affected if `%Promise.prototype%.constructor` was replaced by this `SafePromise` constructor.
