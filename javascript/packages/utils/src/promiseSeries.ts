export async function series(
  functionsThatGeneratePromisesThatRunInSeries: any[],
  concurrency = 1,
) {
  let results: any = null;

  functionsThatGeneratePromisesThatRunInSeries =
    functionsThatGeneratePromisesThatRunInSeries.slice();

  return new Promise((resolve, reject) => {
    const next = (result?: any) => {
      const concurrentPromises = [];
      results = !results ? [] : [...results, ...result];

      if (functionsThatGeneratePromisesThatRunInSeries.length) {
        while (
          concurrentPromises.length < concurrency &&
          functionsThatGeneratePromisesThatRunInSeries.length
        ) {
          let promise = functionsThatGeneratePromisesThatRunInSeries.shift();
          if (typeof promise === "function") {
            promise = promise();
          } else {
            return reject(new Error("Invalid argument")); // see comment above. we need functions
          }

          if (!promise || typeof promise.then !== "function") {
            promise = Promise.resolve(promise); // create a promise and resolve with the `promise` value.
          }

          concurrentPromises.push(promise);
        }

        Promise.all(concurrentPromises).then(next).catch(reject);
      } else {
        return resolve(results);
      }
    };

    next();
  });
}
