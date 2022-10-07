#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const orchestrator_1 = require("@zombienet/orchestrator");
const axios_1 = __importDefault(require("axios"));
const commander_1 = require("commander");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importStar(require("path"));
const progress_1 = __importDefault(require("progress"));
const test_runner_1 = require("./test-runner");
const fs_2 = require("./utils/fs");
const constants_1 = require("./constants");
const DEFAULT_CUMULUS_COLLATOR_URL = "https://github.com/paritytech/cumulus/releases/download/v0.9.270/polkadot-parachain";
// const DEFAULT_ADDER_COLLATOR_URL =
//   "https://gitlab.parity.io/parity/mirrors/polkadot/-/jobs/1769497/artifacts/raw/artifacts/adder-collator";
const colors_1 = require("./utils/colors");
const zombienet_dsl_parser_wrapper_1 = __importDefault(require("@parity/zombienet-dsl-parser-wrapper"));
const nunjucks_1 = require("nunjucks");
const misc_1 = require("./utils/misc");
const nunjucks_relative_loader_1 = require("./utils/nunjucks-relative-loader");
const options = {
    "polkadot-parachain": {
        name: "polkadot-parachain",
        url: DEFAULT_CUMULUS_COLLATOR_URL,
        size: "120",
    },
    // // Deactivate for now
    // adderCollator: {
    //   name: "adderCollator",
    //   url: DEFAULT_ADDER_COLLATOR_URL,
    //   size: "950",
    // },
};
const debug = require("debug")("zombie-cli");
const program = new commander_1.Command("zombienet");
let network;
// Download the binaries
const downloadBinaries = (binaries) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`${colors_1.decorators.yellow("\nStart download...\n")}`);
    const promises = [];
    let count = 0;
    for (let binary of binaries) {
        promises.push(new Promise((resolve) => __awaiter(void 0, void 0, void 0, function* () {
            const { url, name } = options[binary];
            const { data, headers } = yield (0, axios_1.default)({
                url,
                method: "GET",
                responseType: "stream",
            });
            const totalLength = headers["content-length"];
            const progressBar = new progress_1.default("-> downloading [:bar] :percent :etas", {
                width: 40,
                complete: "=",
                incomplete: " ",
                renderThrottle: 1,
                total: parseInt(totalLength),
            });
            const writer = fs_1.default.createWriteStream(path_1.default.resolve(__dirname, name));
            data.on("data", (chunk) => progressBar.tick(chunk.length));
            data.pipe(writer);
            data.on("end", () => {
                console.log(colors_1.decorators.yellow(`Binary "${name}" downloaded`));
                // Add permissions to the binary
                console.log(colors_1.decorators.cyan(`Giving permissions to "${name}"`));
                fs_1.default.chmodSync(path_1.default.resolve(__dirname, name), 0o755);
                resolve();
            });
        })));
    }
    yield Promise.all(promises);
    console.log(colors_1.decorators.cyan(`Please add the dir to your $PATH by running the command:`), colors_1.decorators.blue(`export PATH=${__dirname}:$PATH`));
});
// Retrieve the latest release for polkadot
const latestPolkadotReleaseURL = (repo, name) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield axios_1.default.get(`https://api.github.com/repos/paritytech/${repo}/releases/latest`);
        const obj = res.data.assets.filter((a) => a.name === name);
        return [
            `https://github.com/paritytech/${repo}/releases/download/${res.data.tag_name}/${name}`,
            (0, misc_1.convertBytes)(obj[0].size),
        ];
    }
    catch (err) {
        if (err.code === "ENOTFOUND") {
            throw new Error("Network error.");
        }
        else if (err.response && err.response.status === 404) {
            throw new Error("Could not find a release.");
        }
        throw new Error(err);
    }
});
function getTestNameFromFileName(testFile) {
    const fileWithOutExt = testFile.split(".")[0];
    const fileName = fileWithOutExt.split("/").pop() || "";
    const parts = fileName.split("-");
    const name = parts[0].match(/\d/)
        ? parts.slice(1).join(" ")
        : parts.join(" ");
    return name;
}
// Convert functions
// Read the input file
function readInputFile(ext, fPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let json;
        if (ext === "json" || ext === "js") {
            json =
                ext === "json"
                    ? JSON.parse(fs_1.default.readFileSync(`${fPath}`, "utf8"))
                    : yield Promise.resolve().then(() => __importStar(require(path_1.default.resolve(fPath))));
        }
        else {
            throw Error("No valid extension was found.");
        }
        return json;
    });
}
function convertInput(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const { fullPath, fileName, extension } = (0, misc_1.getFilePathNameExt)(filePath);
        const convertedJson = yield readInputFile(extension, filePath);
        const { relaychain, parachains, simpleParachains, hrmpChannels, types } = convertedJson;
        let jsonOutput;
        const nodes = [];
        const paras = [];
        let collators = [];
        const DEFAULT_NODE_VALUES = {
            validator: true,
            invulnerable: true,
            balance: constants_1.DEFAULT_BALANCE,
        };
        parachains &&
            parachains.forEach((parachain) => {
                collators = [];
                parachain.nodes.forEach((n) => {
                    collators.push(Object.assign({ name: n.name, command: "adder-collator" }, DEFAULT_NODE_VALUES));
                });
                paras.push({
                    id: parachain.id,
                    collators,
                });
            });
        collators = [];
        simpleParachains &&
            simpleParachains.forEach((sp) => {
                collators.push(Object.assign({ name: sp.name, command: "adder-collator" }, DEFAULT_NODE_VALUES));
                paras.push({
                    id: sp.id,
                    collators,
                });
            });
        if (relaychain === null || relaychain === void 0 ? void 0 : relaychain.nodes) {
            relaychain.nodes.forEach((n) => {
                nodes.push(Object.assign({ name: `"${n.name}"` }, DEFAULT_NODE_VALUES));
            });
        }
        jsonOutput = {
            relaychain: {
                default_image: "docker.io/paritypr/polkadot-debug:master",
                default_command: "polkadot",
                default_args: ["-lparachain=debug"],
                chain: (relaychain === null || relaychain === void 0 ? void 0 : relaychain.chain) || "",
                nodes,
                genesis: relaychain === null || relaychain === void 0 ? void 0 : relaychain.genesis,
            },
            types,
            hrmp_channels: hrmpChannels || [],
            parachains: paras,
        };
        fs_1.default.writeFile(`${fullPath}/${fileName}-zombienet.json`, JSON.stringify(jsonOutput), (error) => {
            if (error)
                throw error;
        });
        console.log(`Converted JSON config exists now under: ${fullPath}/${fileName}-zombienet.json`);
    });
}
// Ensure to log the uncaught exceptions
// to debug the problem, also exit because we don't know
// what happens there.
process.on("uncaughtException", (err) => __awaiter(void 0, void 0, void 0, function* () {
    if (network) {
        debug("removing namespace: " + network.namespace);
        yield network.stop();
    }
    console.log(`uncaughtException`);
    console.log(err);
    debug(err);
    process.exit(100);
}));
// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
// http://www.hacksrus.net/blog/2015/08/a-solution-to-swallowed-exceptions-in-es6s-promises/
process.on("unhandledRejection", (err) => __awaiter(void 0, void 0, void 0, function* () {
    if (network) {
        debug("removing namespace: " + network.namespace);
        yield network.stop();
    }
    debug(err);
    console.log(`UnhandledRejection: ${err}`);
    process.exit(1001);
}));
// Handle ctrl+c to trigger `exit`.
let alreadyTry = false;
process.on("SIGINT", function () {
    return __awaiter(this, void 0, void 0, function* () {
        process.env.terminating = "1";
        if (network && !alreadyTry) {
            alreadyTry = true;
            const msg = "Ctrl+c ... removing namespace: " + network.namespace;
            console.log(colors_1.decorators.magenta(msg));
            debug(msg);
            yield network.stop();
        }
        process.exit(2);
    });
});
process.on("exit", function () {
    return __awaiter(this, void 0, void 0, function* () {
        process.env.terminating = "1";
        if (network && !alreadyTry) {
            alreadyTry = true;
            debug("removing namespace: " + network.namespace);
            yield network.dumpLogs();
            yield network.stop();
        }
        const exitCode = process.exitCode !== undefined ? process.exitCode : 2;
        // use exitCode set by mocha or 2 as default.
        process.exit(exitCode);
    });
});
program
    .addOption(new commander_1.Option("-c, --spawn-concurrency <concurrency>", "Number of concurrent spawning process to launch, default is 1"))
    .addOption(new commander_1.Option("-p, --provider <provider>", "Override provider to use").choices(["podman", "kubernetes", "native"]))
    .addOption(new commander_1.Option("-m, --monitor", "Start as monitor, do not auto cleanup network"));
program
    .command("spawn")
    .description("Spawn the network defined in the config")
    .argument("<networkConfig>", "Network config file path")
    .argument("[creds]", "kubeclt credentials file")
    .action(spawn);
program
    .command("test")
    .description("Run tests on the network defined")
    .argument("<testFile>", "ZNDSL file (.zndsl) describing the tests")
    .argument("[runningNetworkSpec]", "Path to the network spec json, for using a running network for running the test")
    .action(test);
program
    .command("setup")
    .description("Setup is meant for downloading and making dev environment of ZombieNet ready")
    .argument("<binaries...>", `the binaries that you want to be downloaded, provided in a row without any separators;\nThey are downloaded in current directory and appropriate executable permissions are assigned.\nPossible options: 'polkadot', 'polkadot-parachain'\n${colors_1.decorators.blue("zombienet setup polkadot polkadot-parachain")}`)
    .action(setup);
program
    .command("convert")
    .description("Convert is meant for transforming a (now deprecated) polkadot-launch configuration to zombienet configuration")
    .argument("<filePath>", `Expecting 1 mandatory param which is the path of the polkadot-lauch configuration file (could be either a .js or .json file).`)
    .action(convert);
program
    .command("version")
    .description("Prints zombienet version")
    .action(() => {
    const p = require("../package.json");
    console.log(p.version);
    process.exit(0);
});
/**
 * Spawn - spawns ephemeral networks, providing a simple but poweful cli that allow you to declare
 * the desired network in toml or json format.
 * Read more here: https://paritytech.github.io/zombienet/cli/spawn.html
 * @param configFile: config file, supported both json and toml formats
 * @param credsFile: Credentials file name or path> to use (Only> with kubernetes provider), we look
 *  in the current directory or in $HOME/.kube/ if a filename is passed.
 * @param _opts
 */
function spawn(configFile, credsFile, _opts) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const opts = program.opts();
        const monitor = opts.monitor || false;
        const spawnConcurrency = opts.spawnConcurrency || 1;
        const configPath = (0, path_1.resolve)(process.cwd(), configFile);
        if (!fs_1.default.existsSync(configPath)) {
            console.error("  ⚠ Config file does not exist: ", configPath);
            process.exit();
        }
        const filePath = (0, path_1.resolve)(configFile);
        const config = (0, fs_2.readNetworkConfig)(filePath);
        // set default provider and timeout if not provided
        if (!config.settings) {
            config.settings = {
                provider: constants_1.DEFAULT_PROVIDER,
                timeout: constants_1.DEFAULT_GLOBAL_TIMEOUT,
            };
        }
        else {
            if (!config.settings.provider)
                config.settings.provider = constants_1.DEFAULT_PROVIDER;
            if (!config.settings.timeout)
                config.settings.timeout = constants_1.DEFAULT_GLOBAL_TIMEOUT;
        }
        // if a provider is passed, let just use it.
        if (opts.provider && constants_1.AVAILABLE_PROVIDERS.includes(opts.provider)) {
            config.settings.provider = opts.provider;
        }
        let creds = "";
        if (((_a = config.settings) === null || _a === void 0 ? void 0 : _a.provider) === "kubernetes") {
            creds = (0, fs_2.getCredsFilePath)(credsFile || "config") || "";
            if (!creds) {
                console.log(`Running ${((_b = config.settings) === null || _b === void 0 ? void 0 : _b.provider) || constants_1.DEFAULT_PROVIDER} provider:`);
                console.error("  ⚠ I can't find the Creds file: ", credsFile);
                process.exit();
            }
        }
        const options = { monitor, spawnConcurrency };
        network = yield (0, orchestrator_1.start)(creds, config, options);
        network.showNetworkInfo((_c = config.settings) === null || _c === void 0 ? void 0 : _c.provider);
    });
}
/**
 * Test - performs test/assertions agins the spawned network, using a set of natural
 * language expressions that allow to make assertions based on metrics, logs and some
 * built-in function that query the network using polkadot.js
 * Read more here: https://paritytech.github.io/zombienet/cli/testing.html
 * @param testFile
 * @param runningNetworkSpec
 * @param _opts
 */
function test(testFile, runningNetworkSpec, _opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const opts = program.opts();
        process.env.DEBUG = "zombie";
        const inCI = process.env.RUN_IN_CONTAINER === "1";
        // use `k8s` as default
        const providerToUse = opts.provider && constants_1.AVAILABLE_PROVIDERS.includes(opts.provider)
            ? opts.provider
            : "kubernetes";
        const configBasePath = path_1.default.dirname(testFile);
        const env = new nunjucks_1.Environment(new nunjucks_relative_loader_1.RelativeLoader([configBasePath]));
        const temmplateContent = fs_1.default.readFileSync(testFile).toString();
        const content = env.renderString(temmplateContent, process.env);
        const testName = getTestNameFromFileName(testFile);
        let testDef;
        try {
            testDef = JSON.parse(zombienet_dsl_parser_wrapper_1.default.parse_to_json(content));
        }
        catch (e) {
            console.log(e);
            process.exit(1);
        }
        yield (0, test_runner_1.run)(configBasePath, testName, testDef, providerToUse, inCI, opts.spawnConcurrency, runningNetworkSpec);
    });
}
/**
 * Setup - easily download latest artifacts and make them executablein order to use them with zombienet
 * Read more here: https://paritytech.github.io/zombienet/cli/setup.html
 * @param params binaries that willbe downloaded and set up. Possible values: `polkadot` `polkadot-parachain`
 * @returns
 */
function setup(params) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`${colors_1.decorators.green("\n\n🧟🧟🧟 ZombieNet Setup 🧟🧟🧟\n\n")}`);
        if (["aix", "freebsd", "openbsd", "sunos", "win32"].includes(process.platform)) {
            console.log("Zombienet currently supports linux and MacOS. \n Alternative, you can use k8s or podman. For more read here: https://github.com/paritytech/zombienet#requirements-by-provider");
            return;
        }
        yield new Promise((resolve) => {
            latestPolkadotReleaseURL("polkadot", "polkadot").then((res) => {
                options.polkadot = {
                    name: "polkadot",
                    url: res[0],
                    size: res[1],
                };
                resolve();
            });
        });
        // If the platform is MacOS then the polkadot repo needs to be cloned and run locally by the user
        // as polkadot do not release a binary for MacOS
        if (process.platform === "darwin" && params.includes("polkadot")) {
            console.log(`${colors_1.decorators.yellow("Note: ")} You are using MacOS. Please, clone the polkadot repo ` +
                `${colors_1.decorators.cyan("(https://github.com/paritytech/polkadot)")}` +
                ` and run it locally.\n At the moment there is no polkadot binary for MacOs.\n\n`);
            const index = params.indexOf("polkadot");
            if (index !== -1) {
                params.splice(index, 1);
            }
        }
        if (params.length === 0) {
            console.log(`${colors_1.decorators.green("No more binaries to download. Exiting...")}`);
            return;
        }
        let count = 0;
        console.log("Setup will start to download binaries:");
        params.forEach((a) => {
            var _a;
            const size = parseInt(((_a = options[a]) === null || _a === void 0 ? void 0 : _a.size) || "0", 10);
            count += size;
            console.log("-", a, "\t Approx. size ", size, " MB");
        });
        console.log("Total approx. size: ", count, "MB");
        const response = yield (0, fs_2.askQuestion)(`${colors_1.decorators.yellow("\nDo you want to continue? (y/n)")}`);
        if (response.toLowerCase() !== "n" && response.toLowerCase() !== "y") {
            console.log("Invalid input. Exiting...");
            return;
        }
        if (response.toLowerCase() === "n") {
            return;
        }
        downloadBinaries(params);
        return;
    });
}
function convert(param) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const filePath = param;
            if (!filePath) {
                throw Error("Path of configuration file was not provided");
            }
            // Read through the JSON and write to stream sample
            yield convertInput(filePath);
        }
        catch (err) {
            console.log("error", err);
        }
    });
}
program.parse(process.argv);
