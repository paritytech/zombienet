async function run(nodeName, networkInfo, argObject) {
    let err = false;
    console.log(argObject);
    if (argObject.account != "alice") {
        console.log("JSON err: field name");
        err = true;
    }
    if (argObject.nums[1] !== 1) {
        console.log("JSON err: field nums");
        err = true;
    }
    if (argObject.bool !== true) {
        console.log("JSON err: field nums");
        err = true;
    }

    if(err) throw new Error('JSON should be {"account": "alice", "nums": [0,1,2,3], "bool": true}');
}

module.exports = { run }