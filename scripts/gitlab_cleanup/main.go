package main

import (
    "context"
    "fmt"
    "log"
    "os"
    "strconv"
    "time"
    "strings"

    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
)

func main() {
    config, err := rest.InClusterConfig()
    if err != nil {
        log.Fatalf("Error creating in-cluster config: %s\n", err)
    }

    clientset, err := kubernetes.NewForConfig(config)
    if err != nil {
        log.Fatalf("Error creating clientset: %s\n", err)
    }

    podAgeThresholdHours := 12 // default
    if envVal, exists := os.LookupEnv("POD_AGE_THRESHOLD_HOURS"); exists {
        if val, err := strconv.Atoi(envVal); err == nil {
            podAgeThresholdHours = val
        }
    }

    pods, err := clientset.CoreV1().Pods("gitlab").List(context.Background(), metav1.ListOptions{
        LabelSelector: "pod",
    })
    if err != nil {
        log.Fatalf("Error listing pods: %s\n", err)
    }

    for _, pod := range pods.Items {
        if time.Since(pod.CreationTimestamp.Time).Hours() > float64(podAgeThresholdHours) && strings.HasPrefix(pod.Labels["pod"], "runner-") {
            fmt.Printf("Deleting pod %s which is older than %d hours\n", pod.Name, podAgeThresholdHours)
            err := clientset.CoreV1().Pods(pod.Namespace).Delete(context.Background(), pod.Name, metav1.DeleteOptions{})
            if err != nil {
                fmt.Printf("Error deleting pod %s: %s\n", pod.Name, err)
            }
        }
    }
}
