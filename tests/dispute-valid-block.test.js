const zombie = require('../');
const expect = require('chai').expect;

const creds = '/Users/pepo/.kube/config'
const networkConfig = require('../examples/dispute-valid-block.json');


describe('Dispute valid block', async () => {
    let network;
    before( 'launching', async function() {
        this.timeout(300*1000);
        network = await zombie.start(creds, networkConfig);
        return;
    });

    after( 'teardown', async function() {
        this.timeout(60*1000);
        if(network) await network.stop();
        return;
    });

    it('alice is up', async () => {
        const isUp = await network.node('alice').isUp();
        expect(isUp).to.be.ok;
    });

    it('alice reports node_roles is 4', async () => {
      const nodeRoles = await network.node('alice').getMetric('node_roles');
      expect(nodeRoles).to.equal(4);
    });

    it('alice reports sub_libp2p_is_major_syncing is 0', async () => {
        expect(await network.node('alice').getMetric('sub_libp2p_is_major_syncing')).to.equal(0);
    });

    it('alice reports block height is at least 2(between 15 secs)', async () => {
        const blockHeight = await network.node('alice').getMetric("block height", 2, 15);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('alice reports peers count is at least 2', async () => {
        const blockHeight = await network.node('alice').getMetric("peers count", 2);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);
  });