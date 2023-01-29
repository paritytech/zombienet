package controllers

import (
	"auth-service/authorization"
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/gin-gonic/gin"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func GetAllNS(c *gin.Context) {
	config, err := rest.InClusterConfig()
	if err != nil {
		fmt.Println("Error getting in-cluster config:", err)
		return
	}

	clientSet, err := kubernetes.NewForConfig(config)
	if err != nil {
		fmt.Println("Error creating client:", err)
		return
	}

	authorized, owner := authorization.AuthorizeUser(c)
	if !authorized {
		c.JSON(401, gin.H{
			"message": "Not Authorized",
		})
		return
	}

	namespaces, err := clientSet.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		c.JSON(500, gin.H{
			"message": err.Error(),
		})
		return
	}

	namespaceList := []string{}

	for _, namespace := range namespaces.Items {
		if !strings.HasPrefix(namespace.Name, "zombie-") {
			continue
		}
		if actualOwner, ok := namespace.Annotations["parity.io/owner"]; ok && owner == actualOwner {
			namespaceList = append(namespaceList, namespace.Name)
		}
	}

	c.JSON(200, gin.H{
		"namespaces": namespaceList,
	})
}
