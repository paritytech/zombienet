package authorization

import (
	"context"
	"io/ioutil"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func AuthorizeUser(c *gin.Context) (bool, string) {
	config, err := rest.InClusterConfig()
	if err != nil {
		panic("Error getting in-cluster config")
	}

	userToken := c.GetHeader("Authorization")

	clientSet, err := kubernetes.NewForConfig(config)
	if err != nil {
		panic("Error creating client")
	}

	bytes, _ := ioutil.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
	currentNamespace := string(bytes)

	secrets, err := clientSet.CoreV1().Secrets(currentNamespace).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		panic("Error fetching secrets")
	}

	for _, secret := range secrets.Items {
		if secret.Annotations["parity.io/role"] == "user" {
			token, ok := secret.Data["token"]
			if ok {
				if string(token) == userToken {
					return true, secret.Name
				}
			} else {
				continue
			}
		}
	}
	return false, "NO_OWNER"
}
