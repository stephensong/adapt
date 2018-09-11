import { filePathToUrl, localRegistryDefaults, mochaTmpdir } from "@usys/utils";
import * as fs from "fs-extra";
import { last } from "lodash";
import * as path from "path";
import { clitest, expect } from "../../common/fancy";

const localRegistryUrl = localRegistryDefaults.localRegistryUrl;
const domFilename = "adapt_dom.xml";
const stateFilename = "adapt_state.json";
const infoFilename = "adapt_deploy.json";

const basicPackageJson = {
    name: "test",
    version: "1.0.0",
    description: "Adapt project",
    main: "dist/index.js",
    scripts: {},
    author: "",
    license: "UNLICENSED",
    dependencies: {
        "@types/node": "^8.10",
        "@usys/adapt": "0.0.1",
        "source-map-support": "^0.5.6",
        "typescript": "^2.8.3",
    },
};

const simplePluginTs = `
import { Action, Plugin, PluginOptions, registerPlugin } from "@usys/adapt";

class EchoPlugin implements Plugin<{}> {
    _log?: PluginOptions["log"];

    log(...args: any[]) {
        if (this._log == null) throw new Error("Plugin has no log function");
        this._log(this.constructor.name + ":", ...args);
    }

    async start(options: PluginOptions) {
        if (options.log == null) throw new Error("Plugin start called without log");
        this._log = options.log;
        this.log("start");
    }
    async observe(_oldDom: any, dom: any) {
        this.log("observe", dom);
        return {};
    }
    analyze(_oldDom: any, dom: any, _obs: {}): Action[] {
        this.log("analyze", dom);
        return [
            { description: "echo action1", act: () => this.doAction("action1") },
            { description: "echo action2", act: () => this.doAction("action2") }
        ];
    }
    async finish() {
        this.log("finish");
    }

    async doAction(msg: string) {
        this.log(msg);
    }
}

export function create() {
    return new EchoPlugin();
}

registerPlugin({
    module,
    create,
});
`;

const simplePluginPackageJson = `
{
    "name": "echo_plugin",
    "version": "1.0.0",
    "description": "",
    "main": "index.js",
    "scripts": { },
    "author": ""
}
`;

function fakeWindowSize() {
    return [80, 40];
}

async function createProject(pkgJson: any, tsFile: string,
                             tsFilename: string): Promise<void> {
    await fs.writeJson("package.json", pkgJson, {spaces: 2});
    await fs.outputFile(tsFilename, tsFile);
    await fs.outputFile(path.join("simple_plugin", "package.json"), simplePluginPackageJson);
    await fs.outputFile(path.join("simple_plugin", "index.ts"), simplePluginTs);
}

const testCommonNoEnv =
    clitest
    .stdout()
    .stderr();

const testCommon =
    testCommonNoEnv
    .delayedenv(() => {
        return {
            ADAPT_NPM_REGISTRY: localRegistryUrl,
            ADAPT_SERVER_URL: filePathToUrl(process.cwd()),
        };
    });

const testBase =
    testCommon
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

const testBaseTty =
    testCommon
    .stub(process.stdout, "isTTY", true) // Ensure TTY-flavored output on stdout
    .stub(process.stdout, "getWindowSize", fakeWindowSize);

/*
 * Basic tests
 */

const basicIndexTsx = `
    import Adapt, { PrimitiveComponent } from "@usys/adapt";
    import "./simple_plugin";

    class Root extends PrimitiveComponent<{}> { }

    const app = <Root />;
    Adapt.stack("dev", app);
`;

// Expects only 1 active deployment
async function findDeploymentDir(): Promise<string> {
    const deploymentList = await fs.readdir("deployments");
    expect(deploymentList).to.be.length(1);
    return path.resolve("deployments", deploymentList[0]);
}

async function findHistoryDir(): Promise<string> {
    const deploymentDir = await findDeploymentDir();
    const historyDirs = await fs.readdir(deploymentDir);
    expect(historyDirs.length).to.be.greaterThan(0);
    return path.join(deploymentDir, last(historyDirs)!);
}

async function checkBasicIndexTsxState(
    fileName: string,
    projectRoot: string,
    stackName: string
): Promise<void> {

    const historyDir = await findHistoryDir();
    const fileList = await fs.readdir(historyDir);
    expect(fileList).eqls([
        infoFilename,
        domFilename,
        stateFilename,
    ]);
    const domXml = await fs.readFile(path.join(historyDir, domFilename));
    expect(domXml.toString()).equals(
`<Adapt>
  <Root key="Root" xmlns="urn:Adapt:test:1.0.0:$adaptExports:../index.tsx:Root"/>
</Adapt>
`);
    const state = await fs.readJson(path.join(historyDir, stateFilename));
    expect(state).eqls({});

    const info = await fs.readJson(path.join(historyDir, infoFilename));
    expect(info).eqls({
        fileName,
        projectRoot,
        stackName,
    });
}

const basicTestChain =
    testBase
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    });

function checkPluginStdout(stdout: string, dryRun = false) {
    const msgs: {[key: string]: boolean} = {
        start: true,
        observe: true,
        analyze: true,
        finish: true,
        action1: !dryRun,
        action2: !dryRun,
    };

    for (const m of Object.keys(msgs)) {
        const line = `EchoPlugin: ${m}`;
        if (msgs[m]) expect(stdout).to.contain(line);
        else expect(stdout).to.not.contain(line);
    }
}

describe("Deploy create basic tests", function () {
    this.timeout(30000);
    mochaTmpdir.each("adapt-cli-test-deploy");

    basicTestChain
    .command(["deploy:create", "--init", "dev"])

    .it("Should build basic default filename", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev"
        );

    });

    testBaseTty
    .do(async () => {
        await createProject(basicPackageJson, basicIndexTsx, "index.tsx");
    })
    .command(["deploy:create", "--init", "dev"])

    .it("Should build basic with TTY output", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("✔ Validating project");
        expect(ctx.stdout).contains("✔ Creating new project deployment");

        checkPluginStdout(ctx.stdout);

        await checkBasicIndexTsxState(
            path.join(process.cwd(), "index.tsx"),
            process.cwd(),
            "dev"
        );
    });

    basicTestChain
    .command(["deploy:create", "--init", "--dryRun", "dev"])

    .it("Should not modify anything with --dryRun", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        checkPluginStdout(ctx.stdout, true);

        const deploymentList = await fs.readdir("deployments");
        expect(deploymentList).length(0);
    });
});

/*
 * State update tests
 */

function stateUpdateIndexTsx(initialStateStr: string, newStateStr: string) {
    return `
    import Adapt, { AnyState, Component, PrimitiveComponent } from "@usys/adapt";
    import "./simple_plugin";

    class Empty extends PrimitiveComponent<{ id: number }> { }

    interface StateUpdaterProps {
        newState: (prev: any, props: StateUpdaterProps) => any;
        initialState: any;
    }

    class StateUpdater extends Component<StateUpdaterProps, AnyState> {

        build() {
            this.setState(this.props.newState);
            return <Empty id={1} />;
        }
    }

    const initialState = ${initialStateStr};
    const newState = ${newStateStr};

    const app = <StateUpdater newState={newState} initialState={initialState} />;
    Adapt.stack("dev", app);
`;
}

async function checkStateUpdateState(count: number): Promise<void> {
    const deploymentDir = await findDeploymentDir();
    const historyList = await fs.readdir(deploymentDir);
    expect(historyList.length).equals(count);

    historyList.sort();
    for (let i = 0; i < count; i++) {
        const dirName = historyList[i];

        const matches = dirName.match(/^(\d{5})-/);
        expect(matches).to.be.an("array").with.lengthOf(2);
        if (matches == null) return;
        expect(parseInt(matches[1], 10)).to.equal(i);

        const dir = path.join(deploymentDir, dirName);

        const domXml = await fs.readFile(path.join(dir, domFilename));
        expect(domXml.toString()).equals(
`<Adapt>
  <Empty id="1" xmlns="urn:Adapt:test:1.0.0:$adaptExports:../index.tsx:Empty">
    <__props__>
      <prop name="key">"StateUpdater-Empty"</prop>
    </__props__>
  </Empty>
</Adapt>
`);
        const state = await fs.readJson(path.join(dir, stateFilename));
        expect(state).eqls({
            '["StateUpdater"]': { count: i + 1 }
        });
    }
}

const stateIncrementTestChain =
    testBase
    .do(async () => {
        const indexTsx = stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 1 })");
        await createProject(basicPackageJson, indexTsx, "index.tsx");
    });

const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

describe("Deploy update basic tests", () => {
    let deployID = "NOTFOUND";

    // These tests must all use a single temp directory where the
    // state_history can be shared and built upon
    mochaTmpdir.all("adapt-cli-test-deploy");

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 1 })")))
    .command(["deploy:create", "--init", "dev"])

    .it("Should create initial state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment created successfully. DeployID is:`);

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) deployID = matches[1];

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(1);
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 2 })")))
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create second state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(2);
    });

    stateIncrementTestChain
    .do(async () => fs.outputFile("index.tsx",
        stateUpdateIndexTsx("{count: 1}", "(_prev, _props) => ({ count: 3 })")))
    .delayedcommand(() => ["deploy:update", deployID, "dev"])

    .it("Should create third state", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Updating project deployment [completed]");
        expect(ctx.stdout).contains(`Deployment ${deployID} updated successfully`);

        checkPluginStdout(ctx.stdout);

        await checkStateUpdateState(3);
    });
});

describe("Build negative tests", () => {
    mochaTmpdir.each("adapt-cli-test-deploy");

    testBase
    .command(["deploy:create", "--rootFile", "doesntexist", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            "Project file 'doesntexist' does not exist");
    })
    .it("Should fail if file doesn't exist");

    testBase
    .do(() => {
        return fs.ensureFile(path.join(process.cwd(), "test.ts"));
    })
    .command(["deploy:create", "--rootFile", "test.ts", "--init", "dev"])
    .catch((err: any) => {
        expect(err.oclif).is.an("object");
        expect(err.oclif.exit).equals(2);
        expect(err.message).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    })
    .it("Should fail if package.json doesn't exist", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("This project cannot be deployed");
        expect(ctx.stdout).contains(
            `The directory '${process.cwd()}' does not contain a package.json file`);
    });

    basicTestChain
    .command(["deploy:create", "--init", "dev"])
    .command(["deploy:update", "abc123", "dev"])
    .catch((err: any) => {
        expect(err.message).contains(
            "Deployment 'abc123' does not exist");
    })
    .it("Should fail if deployment doesn't exist");
});