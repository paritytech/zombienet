use k8s_openapi::api::core::v1::Namespace;
use kube::{
    api::{Api, DeleteParams, ListParams},
    Client,
};

use futures::stream::FuturesUnordered;

#[derive(Debug, Clone)]
pub struct NamespaceCI {
    ns_name: String,
    job_id: String,
    repo: String,
}

impl NamespaceCI {
    pub fn new(ns_name: impl Into<String>, job_id: impl Into<String>, repo: impl Into<String>) -> Self {
        Self {
            ns_name: ns_name.into(),
            job_id: job_id.into(),
            repo: repo.into()
        }
    }
}

const CI_URL: &str = "https://gitlab.parity.io/parity/mirrors";
//polkadot-sdk/-/jobs";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::try_default().await?;

    let namespaces: Api<Namespace> = Api::<Namespace>::all(client);
    let list_params = ListParams::default();
    let nss = namespaces.list(&list_params).await?;
    let list = nss.iter().filter_map(|ns| {
        if let Some(name) = ns.metadata.name.as_ref() {
            if !name.contains("zombie-") {
                None
            } else {
                let (job_id, repo) = match get_info_from_annotations(ns) {
                    Ok((job_id, repo)) => (job_id,repo),
                    Err(_) => { return None }
                };

                let ns = NamespaceCI::new(
                    name.as_str(),
                    job_id,
                    repo
                );
                Some(ns)
            }
        } else {
            None
        }
    });

    let req = reqwest::Client::new();
    let tasks = list
        .map(|ns| {
            let r = req.clone();
            tokio::spawn(async move {
                if let Ok(needs) = needs_to_delete(r, &ns.job_id, &ns.repo).await {
                    if needs {
                        Some(ns.ns_name.to_owned())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
        })
        .collect::<FuturesUnordered<_>>();

    let result = futures::future::join_all(tasks).await;

    //delete
    let delete_task: Vec<_> = result
        .into_iter()
        .filter_map(|r| {
            if let Ok(val) = r {
                val
            } else {
                None
            }
        })
        .collect();

    let t = delete_task
        .into_iter()
        .map(|name| {
            let ns = namespaces.clone();
            tokio::spawn(async move {
                println!("deleting ns: {}", name);
                ns.delete(name.clone().as_str(), &DeleteParams::default())
                    .await
            })
        })
        .collect::<FuturesUnordered<_>>();

    let _result = futures::future::join_all(t).await;

    Ok(())
}


fn get_info_from_annotations(ns: &Namespace) -> Result<(String,String), Box<dyn std::error::Error>> {
    let annotation: serde_json::Value = serde_json::from_str(
        ns.metadata
            .annotations
            .as_ref()
            .ok_or("annotation not found")?
            .get("kubectl.kubernetes.io/last-applied-configuration")
            .ok_or("value not found")?
    )?;

    let job_id = annotation["metadata"]["labels"]["jobId"]
                        .as_str().ok_or("can't find jobId")?;
    let repo = annotation["metadata"]["labels"]["projectName"]
                        .as_str().ok_or("can't find projectName")?;
    Ok((job_id.into(), repo.into()))
}
async fn needs_to_delete(
    req: reqwest::Client,
    job_id: &str,
    repo: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let url = format!("{}/{}/-/jobs/{}", CI_URL, repo,  job_id);
    let res = req
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await?
        .text()
        .await?;
    let res_json: serde_json::Value = serde_json::from_str(res.as_str())?;
    let status = res_json["status"]["text"].as_str().unwrap_or_default();
    let needs = status.contains("failed") || status.contains("canceled");
    println!("jobid: {job_id} - status: {status} - will delete: {needs}");
    Ok(needs)
}
