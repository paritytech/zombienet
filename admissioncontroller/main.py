from flask import Flask, request, jsonify
import base64
import jsonpatch
admission_controller = Flask(__name__)

@admission_controller.route('/healthz', methods=['GET'])
def healthz():
    return jsonify({"status": "ok"})

@admission_controller.route('/mutate/pods', methods=['POST'])
def deployment_webhook_mutate():
    request_info = request.get_json()
    namespace=request_info["request"]["namespace"]
    hasNodeSelector="nodeSelector" in request_info["request"]["object"]["spec"].keys()
    if namespace.startswith("zombie-") and not hasNodeSelector:
       return admission_response_patch(True, "Adding allow label", json_patch = jsonpatch.JsonPatch([{"op": "add", "path": "/spec/tolerations", "value": [{"effect":"NoExecute", "key":"workload-type", 
        "operator":"Equal", "value":"large-testnet"}]}, {"op":"add", "path":"/spec/nodeSelector", "value": {"nodetype":"large-network"}}]))
    else:
       return admission_response_patch(True, "Adding allow label", json_patch = jsonpatch.JsonPatch([]))


def admission_response_patch(allowed, message, json_patch):
    base64_patch = base64.b64encode(json_patch.to_string().encode("utf-8")).decode("utf-8")
    return jsonify({"response": {"allowed": allowed,
                                 "status": {"message": message},
                                 "patchType": "JSONPatch",
                                 "patch": base64_patch}})
if __name__ == '__main__':
    admission_controller.run(host='0.0.0.0', port=4443, ssl_context=("keys/server.crt", "keys/server.key"))
