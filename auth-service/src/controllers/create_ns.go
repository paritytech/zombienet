package controllers

import (
	"math/rand"
	"time"

	"github.com/gin-gonic/gin"

	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"auth-service/authorization"
)

type annotation map[string]string

func CreateNS(c *gin.Context) {
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

	namespaceName := gernerateNamespaceName()

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:        namespaceName,
			Annotations: annotation{"parity.io/owner": owner},
		},
	}

	app, err := clientSet.CoreV1().Namespaces().Create(context.TODO(), ns, metav1.CreateOptions{})
	if err != nil {
		fmt.Printf("Error creating namespace: %v", err)
	} else {
		fmt.Printf("Namespace %s created successfully", ns.Name)
	}

	sa, err := clientSet.CoreV1().ServiceAccounts(app.Name).Create(context.TODO(), &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "admin",
			Namespace: namespaceName,
		},
	}, metav1.CreateOptions{})
	if err != nil {
		panic(err)
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name: sa.Name + "-token",
			Annotations: map[string]string{
				"kubernetes.io/service-account.name": sa.Name,
			},
		},
		Type: corev1.SecretTypeServiceAccountToken,
	}

	_, err = clientSet.CoreV1().Secrets(namespaceName).Create(context.TODO(), secret, metav1.CreateOptions{})
	if err != nil {
		panic(err)
	}

	_, err = clientSet.RbacV1().RoleBindings(namespaceName).Create(context.TODO(), &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "admin",
			Namespace: namespaceName,
		},
		Subjects: []rbacv1.Subject{
			{
				Kind:      "ServiceAccount",
				Name:      "admin",
				Namespace: namespaceName,
			},
		},
		RoleRef: rbacv1.RoleRef{
			Kind: "ClusterRole",
			Name: "cluster-admin",
		},
	}, metav1.CreateOptions{})
	if err != nil {
		panic(err)
	}

	adminSecret, err := clientSet.CoreV1().Secrets(namespaceName).Get(context.TODO(), secret.Name, metav1.GetOptions{})
	if err != nil {
		panic(err)
	}

	token := adminSecret.Data["token"]

	c.JSON(200, gin.H{
		"namespace": namespaceName,
		"token":     string(token),
		"message":   "Successfully created namespace " + namespaceName,
	})

	fmt.Println(app)
}

func gernerateNamespaceName() string {
	rand.Seed(time.Now().UnixNano())
	letterRunes := []rune("abcdefghijklmnopqrstuvwxyz0123456789")
	b := make([]rune, 32)
	for i := range b {
		b[i] = letterRunes[rand.Intn(len(letterRunes))]
	}
	return "zombie-" + string(b)
}
