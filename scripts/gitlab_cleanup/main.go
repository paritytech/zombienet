package main

import (
    "context"
    "fmt"
    "os"
    "time"

    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
)

func main() {
    config, err := rest.InClusterConfig()
    if err != nil {
        fmt.Printf("Error creating in-cluster config: %s\n", err)
        os.Exit(1)
    }

    clientset, err := kubernetes.NewForConfig(config)
    if err != nil {
        fmt.Printf("Error creating clientset: %s\n", err)
        os.Exit(1)
    }

    pods, err := clientset.CoreV1().Pods("gitlab").List(context.Background(), metav1.ListOptions{
        LabelSelector: "app=gitlab,selector=runner",
    })
    if err != nil {
        fmt.Printf("Error listing pods: %s\n", err)
        os.Exit(1)
    }

    for _, pod := range pods.Items {
        if time.Since(pod.CreationTimestamp.Time).Hours() > 12 {
            fmt.Printf("Deleting pod %s which is older than 12 hours\n", pod.Name)
            err := clientset.CoreV1().Pods(pod.Namespace).Delete(context.Background(), pod.Name, metav1.DeleteOptions{})
            if err != nil {
                fmt.Printf("Error deleting pod %s: %s\n", pod.Name, err)
            }
        }
    }
}

