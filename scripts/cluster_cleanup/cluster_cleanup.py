import os
from datetime import datetime, timedelta
from kubernetes import client, config
import pytz

def main():
    config.load_incluster_config()

    v1 = client.CoreV1Api()

    prefix = 'zombie-'
    time_delta = timedelta(hours=12)

    now = datetime.utcnow().replace(tzinfo=pytz.UTC)
    cutoff_time = now - time_delta

    namespace_list = v1.list_namespace().items
    for ns in namespace_list:
        if ns.metadata.name.startswith(prefix):
            creation_time = ns.metadata.creation_timestamp.replace(tzinfo=pytz.UTC)
            if creation_time < cutoff_time:
                print(f"Found zombie namespace {ns.metadata.name} (created {now - creation_time} ago and matches the prefix).")
                v1.delete_namespace(ns.metadata.name)

    api_version = 'v1'
    group = 'monitoring.coreos.com'
    plural = 'podmonitors'
    namespace = 'monitoring'

    custom_api = client.CustomObjectsApi()
    pm_list = custom_api.list_namespaced_custom_object(group, api_version, namespace, plural)['items']

    for pm in pm_list:
        name = pm['metadata']['name']
        creation_time = datetime.strptime(pm['metadata']['creationTimestamp'], '%Y-%m-%dT%H:%M:%S%z').replace(tzinfo=None)
        creation_time = creation_time.astimezone(pytz.UTC)
        if creation_time < cutoff_time:
            print(f"Found old PodMonitor {name} in namespace {namespace} (created {now - creation_time} ago).")
            custom_api.delete_namespaced_custom_object(group, api_version, namespace, plural, name, body={}, grace_period_seconds=0)

if __name__ == "__main__":
    main()
