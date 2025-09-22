//#region then-pollution
const originalThen = Promise.prototype.then;
Promise.prototype.then = function (onFulfilled, onRejected) {
  return originalThen.call(this, function (value) {
    console.log('fulfilled', value);
    return onFulfilled ? onFulfilled.call(this, value) : value;
  }, onRejected);
};
//#endregion

//#region constructor-pollution
Promise.prototype.constructor = Promise.bind(null);
//#endregion

//#region user-not-exploited
const p = Promise.resolve(42);
await p; // No console output, pollution ineffective
//#endregion

//#region user-exploited
const p = Promise.resolve(42);
await p; // "fulfilled 42", pollution interfered 
//#endregion

//#region promise-resolve
function PromiseResolve(C, x) {
  if (IsPromise(x)) {
    const xConstructor = x.constructor;
    if (xConstructor === C) return x;
  }
  return new C(resolve => resolve(x));
}
//#endregion

//#region promise-resolve-proposed
function PromiseResolve(C, x) {
  if (IsPromise(x)) {
    const xProto = Reflect.getPrototypeOf(x); // Unobservable
    const cPrototype = C.prototype; // Unobservable if C === %Promise%
    if (xProto === cPrototype) return x;
  }
  return new C(resolve => resolve(x));
}
//#endregion