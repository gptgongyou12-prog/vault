package main

import (
    "fmt"
    webpush "github.com/SherClockHolmes/webpush-go"
)

func main() {
    priv, pub, err := webpush.GenerateVAPIDKeys()
    if err != nil { panic(err) }
    fmt.Printf("VAPID_PRIVATE_KEY=%s\nVAPID_PUBLIC_KEY=%s\n", priv, pub)
}
