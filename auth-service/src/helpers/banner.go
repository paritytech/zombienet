package helpers

import (
	"fmt"
	"io/ioutil"
)

func PrintBanner() {
	bytes, _ := ioutil.ReadFile("banner.txt")
	fmt.Println(string(bytes))
}
