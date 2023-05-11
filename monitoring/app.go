package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

var (
	zombieNamespaceCount = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "zombie_namespace_count",
		Help: "Number of namespaces with names starting with 'zombie-'",
	})

	zombiePodsCount = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "zombie_namespace_pods_count",
		Help: "Number of pods in namespaces with names starting with 'zombie-'",
	}, []string{"namespace"})

	zombieNamespaceOld = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "zombie_namespace_old",
		Help: "Indicates if a namespace with a name starting with 'zombie-' is older than 2 days",
	}, []string{"namespace"})
)

func init() {
	prometheus.MustRegister(zombieNamespaceCount)
	prometheus.MustRegister(zombiePodsCount)
	prometheus.MustRegister(zombieNamespaceOld)
}

func main() {
	config, err := rest.InClusterConfig()
	if err != nil {
		panic(err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		panic(err)
	}

	go func() {
		for {
			updateMetrics(clientset)
			time.Sleep(1 * time.Minute)
		}
	}()

	http.Handle("/metrics", promhttp.Handler())
	http.ListenAndServe(":9090", nil)
}

func updateMetrics(clientset *kubernetes.Clientset) {
	namespaces, err := clientset.CoreV1().Namespaces().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		fmt.Printf("Error listing namespaces: %v\n", err)
		return
	}

	zombieNamespaceCounter := 0
	twoDaysAgo := time.Now().Add(-48 * time.Hour)
	for _, ns := range namespaces.Items {
		if strings.HasPrefix(ns.Name, "zombie-") {
			zombieNamespaceCounter++

			pods, err := clientset.CoreV1().Pods(ns.Name).List(context.Background(), metav1.ListOptions{})
			if err != nil {
				fmt.Printf("Error listing pods in namespace %s: %v\n", ns.Name, err)
				continue
			}

			zombiePodsCount.WithLabelValues(ns.Name).Set(float64(len(pods.Items)))

			if ns.CreationTimestamp.Time.Before(twoDaysAgo) {
				zombieNamespaceOld.WithLabelValues(ns.Name).Set(1)
			} else {
				zombieNamespaceOld.WithLabelValues(ns.Name).Set(0)
			}
		}
	}

	zombieNamespaceCount.Set(float64(zombieNamespaceCounter))
}
