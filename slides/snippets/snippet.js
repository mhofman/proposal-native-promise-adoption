//#region pollution
const originalThen = Promise.prototype.then;
Promise.prototype.then = function (onFulfilled, onRejected) {
  return originalThen.call(this, function (value) {
    console.log('fulfilled', value);
    return onFulfilled ? onFulfilled.call(this, value) : value;
  }, onRejected);
};
//#endregion

//#region library-async-no-await
const add = async (a, b) => a + b;
const inc = async (a) => add(a, 1);
//#endregion

//#region library-async-await
const add = async (a, b) => a + b;
const inc = async (a) => await add(a, 1);
//#endregion

//#region library-promise-no-await
const add = (a, b) => new Promise(resolve => resolve(a + b));
const inc = (a) => new Promise(resolve => resolve(add(a, 1)));
//#endregion

//#region library-promise-await
const add = (a, b) => new Promise(resolve => resolve(a + b));
const inc = (a) => new Promise(resolve => internalThen.call(add(a, 1), resolve));
//#endregion

//#region user-exploited
const three = await add(1, 2); // No console output

const four = await inc(three); // "fulfilled 4"
//#endregion

//#region user-not-exploited
const three = await add(1, 2); // No console output

const four = await inc(three); // No console output
//#endregion

//#region resolve-promise
function ResolvePromise(promise, value) {
  if (value === promise) {
    RejectPromise(promise, TypeError());
  } else if (!IsObject(value)) {
    FulfillPromise(promise, value);
  } else {
    const thenAction = value.then;
    if (typeof thenAction !== 'function') {
      FulfillPromise(promise, value);
    } else {
      queue(() => {
        const { resolve, reject } =
          new Resolvers(promise);
        thenAction.call(value, resolve, reject);
      });
    }
  }
}
//#endregion

//#region resolve-promise-proposed
function ResolvePromise(promise, value) {
  if (value === promise) {
    RejectPromise(promise, TypeError());
  } else if (!IsObject(value)) {
    FulfillPromise(promise, value);
  } else {
    const thenAction = IsPromise(value) &&
      value.__proto__ === Promise.prototype
      ? internalThen
      : value.then;
    if (typeof thenAction !== 'function') {
      FulfillPromise(promise, value);
    } else {
      queue(() => {
        const { resolve, reject } =
          new Resolvers(promise);
        thenAction.call(value, resolve, reject);
      });
    }
  }
}
//#endregion


//#region resolvers
class Resolvers {
  #promise; #alreadyResolved;
  constructor(promise) {
    this.#promise = promise;
    this.#alreadyResolved = false;
  }

  @bound reject(reason) {
    if (!this.#alreadyResolved) return;
    this.#alreadyResolved = true;
    RejectPromise(this.#promise, reason);
  }

  @bound resolve(value) {
    if (!this.#alreadyResolved) return;
    this.#alreadyResolved = true;
    ResolvePromise(this.#promise, value);
  }
}
//#endregion
