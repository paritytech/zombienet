package main

import (
	"auth-service/cmd"
	"auth-service/helpers"
)

func main() {
	helpers.PrintBanner()
	cmd.Run()
}
