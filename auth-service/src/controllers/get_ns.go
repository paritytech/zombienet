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

func GetNS(c *gin.Context) {
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

	namespace := c.Param("namespace")
	if !strings.HasPrefix(namespace, "zombie-") {
		c.JSON(404, gin.H{
			"message": "Not found",
		})
		return
	}

	ns, err := clientSet.CoreV1().Namespaces().Get(context.TODO(), namespace, metav1.GetOptions{})
	if err != nil {
		c.JSON(404, gin.H{
			"message": "Not found",
		})
		return
	}

	nsActualOwner, ok := ns.Annotations["parity.io/owner"]
	if !ok || nsActualOwner != owner {
		c.JSON(404, gin.H{
			"message": "Not found",
		})
		return
	}

	c.JSON(200, gin.H{
		"namespace":       ns.Name,
		"status":          ns.Status.Phase,
		"creationTime":    ns.CreationTimestamp.String(),
		"uid":             ns.UID,
		"resourceVersion": ns.ResourceVersion,
	})
}
