package main

import (
	"fmt"
)

func main() {
	a, b := 5, 6
	c := 6 / (a - b)
	_ = c
	fmt.Println(">- .test github action. -<")
	fmt.Println("> --- everything is ok ---")
	fmt.Println(">...     -exiting-      ..")
}
