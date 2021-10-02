import { spawn } from "child_process";
export async function startPortForwarding(port: number, identifier: string, namespace: string ): Promise<number> {
    return new Promise( (resolve, reject) => {
        const mapping = `:${port}`;
        const args = [
            "port-forward",
            identifier,
            mapping,
            "--namespace",
            namespace
        ];

        const subprocess = spawn("kubectl", args);

        subprocess.stdout.on('data', function (data) {
            const stdout = data.toString();
            const m = /.\d{1,3}:(\d+)/.exec(stdout);
            console.log('stdout: ' + stdout);
            if(m) resolve(parseInt(m[1]));

            reject( new Error(`ERR: port-fw for ${identifier}`));
        });

        subprocess.on('exit', function () {
            console.log('child process exited');
            reject( new Error(`ERR: port-fw for ${identifier}`));
        });
    } );

}