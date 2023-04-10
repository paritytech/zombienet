import { ApiPromise } from "@polkadot/api";
const debug = require("debug")("zombie::js-helpers::events");

export async function findPatternInSystemEventSubscription(
  api: ApiPromise,
  re: RegExp,
  timeout: number,
): Promise<boolean> {
  let found = false;
  found = await new Promise((resolve) => {
    const limitTimeout = setTimeout(() => {
      debug(`Timeout getting pattern (${timeout})`);
      resolve(false);
    }, timeout * 1000);

    api.query.system.events((events: any) => {
      let eventString = "";
      const matchedEvent = events.find((record: any) => {
        eventString = "";
        // extract the phase, event and the event types
        const { event, phase } = record;
        const types = event.typeDef;
        eventString += `${event.section} : ${
          event.method
        } :: phase=${phase.toString()}\n`;
        eventString += event.meta.docs.toString();
        // loop through each of the parameters, displaying the type and data
        event.data.forEach((data: any, index: any) => {
          eventString += `${types[index].type};${data.toString()}`;
        });
        debug(eventString);
        return re.test(eventString);
      });

      if (matchedEvent) {
        debug(eventString);
        clearTimeout(limitTimeout);
        return resolve(true);
      }
    });
  });
  return found;
}
