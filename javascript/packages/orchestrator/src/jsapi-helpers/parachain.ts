import { ApiPromise } from "@polkadot/api";
import type { Option, Vec } from "@polkadot/types";
import type { HeadData, ParaId } from "@polkadot/types/interfaces";

const debug = require("debug")("zombie::js-helpers::parachain");

export async function paraGetBlockHeight(
  api: ApiPromise,
  paraId: number,
): Promise<number> {
  const optHeadData = await api.query.paras.heads<Option<HeadData>>(paraId);

  if (optHeadData?.isSome) {
    const header = api.createType("Header", optHeadData.unwrap().toHex());
    const headerStr = JSON.stringify(header?.toHuman(), null, 2);

    const headerObj = JSON.parse(headerStr);
    const blockNumber = parseInt(headerObj["number"].replace(",", ""));
    debug(`blockNumber : ${blockNumber}`);
    return blockNumber;
  } else {
    return 0;
  }
}

export async function paraIsRegistered(
  api: ApiPromise,
  paraId: number,
): Promise<boolean> {
  const parachains = (await api.query.paras.parachains<Vec<ParaId>>()) || [];
  debug(`parachains : ${JSON.stringify(parachains)}`);
  const isRegistered =
    parachains.findIndex((id) => id.toString() == paraId.toString()) >= 0;
  return isRegistered;
}
