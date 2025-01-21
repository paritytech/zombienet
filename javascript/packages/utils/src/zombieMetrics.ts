function canSend() {
  return process.env["PUSHGATEWAY_URL"] && process.env["CI_JOB_NAME"];
}

function getFromCI() {
  return [
    process.env["CI_JOB_ID"],
    process.env["CI_JOB_NAME"],
    process.env["CI_PROJECT_NAME"] || "",
    process.env["PUSHGATEWAY_URL"],
  ];
}

export async function registerSpawnElapsedTimeSecs(elapsed: number) {
  if (canSend()) {
    const [jobId, jobName, projectName, pushGatewayUrl] = getFromCI();
    const metricName = "zombie_network_ready_secs";
    const help = `# HELP ${metricName} Elapsed time to spawn the network in seconds`;
    const type = `# TYPE ${metricName} gauge`;
    const metricString = `${metricName}{job_id="${jobId}", job_name="${jobName}", project_name="${projectName}"} ${elapsed}`;
    const body = [help, type, metricString, "\n"].join("\n");
    await fetch(pushGatewayUrl!, {
      method: "POST",
      body,
    });
  }
}

export async function registerTotalElapsedTimeSecs(
  elapsed: number,
  success: boolean,
) {
  if (canSend()) {
    const status = success ? "pass" : "fail";
    const [jobId, jobName, projectName, pushGatewayUrl] = getFromCI();
    const metricName = "zombie_test_complete_secs";
    const help = `# HELP ${metricName} Elapsed time to complete the test job in seconds (including spawning, but not teardown)`;
    const type = `# TYPE ${metricName} gauge`;
    const metricString = `${metricName}{job_id="${jobId}", job_name="${jobName}", project_name="${projectName}"}, status="${status}" ${elapsed}`;
    const body = [help, type, metricString, "\n"].join("\n");
    await fetch(pushGatewayUrl!, {
      method: "POST",
      body,
    });
  }
}
