import requests
import os
from flask import Flask, Response
from prometheus_client import Gauge, generate_latest, REGISTRY

GITLAB_URL = "https://gitlab.parity.io"
PROJECT_IDS = os.environ.get("GITLAB_PROJECT_IDS", "").split(",")
PRIVATE_TOKEN = os.environ.get("PRIVATE_TOKEN", "")
TARGET_JOB_NAME = os.environ.get("JOB_NAME", "")

HEADERS = {
    "Private-Token": PRIVATE_TOKEN
}

app = Flask(__name__)

job_status_gauge = Gauge('gitlab_pipeline_job_status',
                         'Number of targeted jobs per status',
                         ['status', 'project_id'])

def get_all_pages(url):
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    data = response.json()
    yield from data

    while 'next' in response.links.keys():
        response = requests.get(response.links['next']['url'], headers=HEADERS)
        response.raise_for_status()
        data = response.json()
        yield from data

@app.route('/metrics', methods=['GET'])
def metrics():
    for project_id in PROJECT_IDS:
        statistics = {
            'canceled': 0,
            'success': 0,
            'pending': 0,
            'running': 0,
            'failed': 0
        }

        url = f"{GITLAB_URL}/api/v4/projects/{project_id}/pipelines"
        for pipeline in get_all_pages(url):
            jobs_url = f"{GITLAB_URL}/api/v4/projects/{project_id}/pipelines/{pipeline['id']}/jobs"
            for job in get_all_pages(jobs_url):
                if job['name'] == TARGET_JOB_NAME and job['status'] in statistics:
                    statistics[job['status']] += 1

        for status, count in statistics.items():
            job_status_gauge.labels(status=status, project_id=project_id).set(count)

    return Response(generate_latest(REGISTRY), mimetype="text/plain")

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000)
