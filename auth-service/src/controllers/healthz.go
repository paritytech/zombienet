package controllers

import "github.com/gin-gonic/gin"

func GetHealthz(c *gin.Context) {
	c.JSON(200, gin.H{
		"message": "Ok",
	})
}
