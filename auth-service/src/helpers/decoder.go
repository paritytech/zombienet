package helpers

import (
	"encoding/base64"
)

func DecodeBase64(encodedString string) string {
	decodedBytes, err := base64.StdEncoding.DecodeString(encodedString)
	if err != nil {
		panic("Error decoding string")
	} else {
		decodedString := string(decodedBytes)
		return decodedString
	}
}
