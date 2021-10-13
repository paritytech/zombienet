const zombie = require('../');
const expect = require('chai').expect;

const creds = '/Users/pepo/.kube/config.gcloud'
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

    const nodes = ['alice', 'bob', 'charlie' ]; // david
    for( const node of nodes ) {
        it(`${node} is up`, async () => {
            const isUp = await network.node(node).isUp();
            expect(isUp).to.be.ok;
        });
    }

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

    it('bob reports block height is at least 2(between 15 secs)', async () => {
        const blockHeight = await network.node('bob').getMetric("block height", 2, 15);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('bob reports peers count is at least 2', async () => {
        const blockHeight = await network.node('bob').getMetric("peers count", 2);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('charlie reports block height is at least 2(between 15 secs)', async () => {
        const blockHeight = await network.node('charlie').getMetric("block height", 2, 15);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('charlie reports peers count is at least 2', async () => {
        const blockHeight = await network.node('charlie').getMetric("peers count", 2);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    for(const node of nodes) {
        it(`${node} reports parachain_candidate_disputes_total is at least 1 (between 121 secs)`, async () => {
            const blockHeight = await network.node(node).getMetric("parachain_candidate_disputes_total", 1,121);
            expect(blockHeight).to.be.at.least(2);
        });
    }

    it('alice parachain_candidate_dispute_votes{validity="valid"}', async () => {
        const blockHeight = await network.node('alice').getMetric('parachain_candidate_dispute_votes{validity="valid"}', 1);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('bob parachain_candidate_dispute_votes{validity="valid"}', async () => {
        const blockHeight = await network.node('bob').getMetric('parachain_candidate_dispute_votes{validity="valid"}', 2);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('charlie parachain_candidate_dispute_votes{validity="valid"}', async () => {
        const blockHeight = await network.node('charlie').getMetric('parachain_candidate_dispute_votes{validity="valid"}', 2);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('alice parachain_candidate_dispute_concluded{validity="valid"}', async () => {
        const blockHeight = await network.node('alice').getMetric('parachain_candidate_dispute_concluded{validity="valid"}', 1);
        expect(blockHeight).to.be.at.least(2);
    }).timeout(0);

    it('alice parachain_candidate_dispute_concluded{validity="invalid"}', async () => {
        const blockHeight = await network.node('alice').getMetric('parachain_candidate_dispute_concluded{validity="invalid"}', 0);
        expect(blockHeight).to.equal(0);
    }).timeout(0);

    it('bob parachain_candidate_dispute_concluded{validity="valid"}', async () => {
        const blockHeight = await network.node('bob').getMetric('parachain_candidate_dispute_concluded{validity="invalid"}', 1);
        expect(blockHeight).to.be.at.least(1);
    }).timeout(0);

    it('charlie parachain_candidate_dispute_concluded{validity="valid"}', async () => {
        const blockHeight = await network.node('charlie').getMetric('parachain_candidate_dispute_concluded{validity="invalid"}', 1);
        expect(blockHeight).to.be.at.least(1);
    }).timeout(0);
  });