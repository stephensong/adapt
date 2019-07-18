import { InternalError } from "@adpt/utils";
import { flags } from "@oclif/command";
import { DeployOpBase } from "../../base";
import { CreateOptions } from "../../types/adapt_shared";
import { addDynamicTask, waitForInitiate } from "../../ui/dynamic_task_mgr";

export default class RunCommand extends DeployOpBase {
    static description = "Create a new deployment for an Adapt project";

    static aliases = [ "run" ];

    static examples = [
`Deploy the stack named "default" from the default project description file, index.tsx:
    $ adapt <%- command.id %>\n`,
`Deploy the stack named "dev" from the default project description file, index.tsx:
    $ adapt <%- command.id %> dev\n`,
`Deploy the stack named "dev" from an alternate description file:
    $ adapt <%- command.id %> --rootFile somefile.tsx dev`,
    ];

    static flags = {
        ...DeployOpBase.flags,
        deployID: flags.string({
            description:
                "A fixed deployID to use for this deployment. Will error if " +
                "the specified deployID already exists.",
        }),
    };

    static args = [
        {
            name: "stackName",
            default: "default",
            description: "Name of the stack you wish to run",
        },
    ];

    async run() {
        const ctx = this.ctx;
        if (ctx == null) throw new InternalError(`ctx cannot be null`);

        const { stackName } = ctx;
        if (stackName == null) throw new InternalError(`stackName cannot be null`);

        const f = this.flags(RunCommand);
        const { deployID } = f;

        const logger = ctx.logger.createChild("run");
        const loggerId = logger.from;

        addDynamicTask(this.tasks, ctx.logger.from, ctx.client, {
            id: loggerId,
            title: "Creating new project deployment",
            adoptable: true,
            initiate: () => {
                if (ctx.project == null) throw new InternalError(`project cannot be null`);

                const createOptions: CreateOptions = {
                    adaptUrl: ctx.adaptUrl,
                    debug: ctx.debug,
                    deployID,
                    dryRun: ctx.dryRun,
                    client: ctx.client,
                    fileName: ctx.projectFile,
                    logger,
                    loggerId,
                    projectName: ctx.project.name,
                    stackName,
                    initLocalServer: true,
                };

                return ctx.project.create(createOptions);
            },
            onCompleteRoot: async (_ctx, _task, err, prom) => {
                const deployState = await waitForInitiate(err, prom);
                const id = deployState.deployID;
                const errorEnding =
                    ctx.dryRun ?
                        `\nDeployment would not have been created due to errors` :
                    id ?
                        `\nDeployment created but errors occurred in the deploy phase.\n` +
                        `DeployID is: ${id}` :
                    `\nDeployment not created due to errors`;

                if (!this.isDeploySuccess(deployState, { errorEnding })) return;

                this.deployInformation(deployState);
                this.appendOutput(`Deployment created successfully. DeployID is: ${id}`);
            }
        });

        await this.tasks.run();
    }
}