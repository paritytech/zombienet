import os
import requests
import time
from prometheus_client import start_http_server, Gauge

GITLAB_API_ENDPOINT = 'https://gitlab.parity.io/api/v4/runners/{}/jobs'
GITLAB_PRIVATE_TOKEN = os.getenv('GITLAB_PRIVATE_TOKEN')
RUNNER_ID = os.getenv('RUNNER_ID')

if not GITLAB_PRIVATE_TOKEN or not RUNNER_ID:
    raise EnvironmentError('The environment variables GITLAB_PRIVATE_TOKEN and RUNNER_ID must be set.')

status_gauges = {
    'created': Gauge('gitlab_runner_jobs_created', 'Number of created jobs'),
    'pending': Gauge('gitlab_runner_jobs_pending', 'Number of pending jobs'),
    'running': Gauge('gitlab_runner_jobs_running', 'Number of running jobs'),
    'failed': Gauge('gitlab_runner_jobs_failed', 'Number of failed jobs'),
    'success': Gauge('gitlab_runner_jobs_success', 'Number of successful jobs'),
    'canceled': Gauge('gitlab_runner_jobs_canceled', 'Number of canceled jobs'),
    'skipped': Gauge('gitlab_runner_jobs_skipped', 'Number of skipped jobs'),
    'manual': Gauge('gitlab_runner_jobs_manual', 'Number of manual jobs'),
}

def fetch_jobs_by_runner(runner_id):
    """Fetch jobs from a specific GitLab Runner and update Prometheus metrics."""
    headers = {'PRIVATE-TOKEN': GITLAB_PRIVATE_TOKEN}
    response = requests.get(GITLAB_API_ENDPOINT.format(runner_id), headers=headers)
    response.raise_for_status()  
    jobs = response.json()
    
    for gauge in status_gauges.values():
        gauge.set(0)

    for job in jobs:
        status = job.get('status')
        if status in status_gauges:
            status_gauges[status].inc()

def main():
    start_http_server(8000)
    print("Metrics server running on port 8000")

    while True:
        fetch_jobs_by_runner(RUNNER_ID)
        time.sleep(60) 

if __name__ == '__main__':
    main()
