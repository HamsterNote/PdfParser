// Polyfill Promise.withResolvers for Node.js < 22
type PromiseWithResolvers = {
  withResolvers?<T>(): {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (reason?: unknown) => void
  }
}

const PromiseWithResolvers = Promise as PromiseWithResolvers

if (typeof PromiseWithResolvers.withResolvers === 'undefined') {
  PromiseWithResolvers.withResolvers = function <T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
