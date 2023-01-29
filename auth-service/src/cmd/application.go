package cmd

import (
	"auth-service/controllers"

	"github.com/gin-gonic/gin"
)

func Run() {
	router := gin.Default()
	router.GET("/v1/ns", controllers.GetAllNS)
	router.POST("/v1/ns", controllers.CreateNS)
	router.GET("/v1/ns/:namespace", controllers.GetNS)
	router.DELETE("/v1/ns/:namespace", controllers.DeleteNS)
	router.GET("/healthz", controllers.GetHealthz)

	router.Run()
}
