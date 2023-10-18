import os
from kubernetes import config, client
import requests
import time

config.load_incluster_config()
v1 = client.CoreV1Api()

node_name = os.getenv("NODE_NAME")
gitlab_token=os.getenv("GITLAB_TOKEN")

def is_node_being_preempted():
    try:
        response = requests.get(f"http://metadata.google.internal/computeMetadata/v1/instance/maintenance-event", headers={"Metadata-Flavor":"Google"})
        if response.text == "TERMINATE_ON_HOST_MAINTENANCE":
            return True
        return False
    except requests.RequestException:
        return False

while True:
   time.sleep(1)
   if not is_node_being_preempted():
       continue
   
   pods = v1.list_pod_for_all_namespaces(field_selector=f"spec.nodeName={node_name}").items
   
   zombie_pods = [pod for pod in pods if pod.metadata.namespace.startswith('zombie-')]
   
   evicted_namespaces=[]
   for pod in zombie_pods:
       ns = pod.metadata.namespace
       if not ns in evicted_namespaces:
           evicted_namespaces+=[ns]

   for evicted_namespace in evicted_namespaces:
       namespace = v1.read_namespace(name=evicted_namespace)
       job_id = namespace.metadata.labels.get('jobId', None)
       project_id = namespace.metadata.labels.get('projectId', None)
       if job_id:
           headers = {
               "PRIVATE-TOKEN": gitlab_token
           }
           job_cancel_url = f"https://gitlab.parity.io/api/v4/projects/{project_id}/jobs/{job_id}/cancel" 
           job_retry_url = f"https://gitlab.parity.io/api/v4/projects/{project_id}/jobs/{job_id}/retry" 
           cancel_response = requests.post(job_cancel_url, headers=headers)
           retry_response = requests.post(job_retry_url, headers=headers)
