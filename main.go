//go:generate go run -tags generate gen.go

package main

import (
	"fmt"
	_ "github.com/influxdata/influxdb1-client" // this is important because of the bug in go mod
	"github.com/zserge/lorca"
	"golang.org/x/crypto/ssh"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"time"
)

func main() {
	args := []string{}
	if runtime.GOOS == "linux" {
		args = append(args, "--class=Lorca")
	}
	ui, err := lorca.New("", "", 1400, 900, args...)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = ui.Close() }()

	// A simple way to know when UI is ready (uses body.onload event in JS)
	_ = ui.Bind("start", func() {
		log.Println("UI is ready")
	})

	// Create and bind Go object to the UI
	influxDB := &influxDB{}
	sqlite := NewSqlite3()
	_ = ui.Bind("ConnectToInfluxdb", influxDB.Connect)
	_ = ui.Bind("Ping", influxDB.Ping)
	_ = ui.Bind("SaveConnection", SaveConnection)
	_ = ui.Bind("Disconnect", influxDB.Disconnect)
	_ = ui.Bind("LoadConnections", sqlite.LoadConnections)
	_ = ui.Bind("RemoveConnection", sqlite.RemoveConnection)
	_ = ui.Bind("ShowDatabases", influxDB.ShowDatabases)
	_ = ui.Bind("ShowTables", influxDB.ShowsMeasurements)
	_ = ui.Bind("ShowHistory", sqlite.ShowHistory)
	_ = ui.Bind("ExecQuery", influxDB.ExecQuery)
	_ = ui.Bind("ExecCommand", influxDB.ExecCommand)

	// Load HTML.
	// You may also use `data:text/html,<base64>` approach to load initial HTML,
	// e.g: ui.Load("data:text/html," + url.PathEscape(html))

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	go http.Serve(ln, http.FileServer(FS))
	ui.Load(fmt.Sprintf("http://%s/index.html", ln.Addr()))

	// You may use console.log to debug your JS code, it will be printed via
	// log.Println(). Also exceptions are printed in a similar manner.
	ui.Eval(`
		console.log("start up!");
	`)

	// Wait until the interrupt signal arrives or browser window is closed
	sigc := make(chan os.Signal)
	signal.Notify(sigc, os.Interrupt)
	select {
	case <-sigc:
	case <-ui.Done():
	}

	log.Println("exiting...")
}

func SSHConnect(user, password, publicKey, host string, port int) (*ssh.Client, error) {
	var (
		auth         []ssh.AuthMethod
		addr         string
		clientConfig *ssh.ClientConfig
		client       *ssh.Client
		//session      *ssh.Session
		err error
	)
	if password != "" {
		auth = append(auth, ssh.Password(password))
	}
	if publicKey != "" {
		auth = append(auth, getPublicKey(publicKey))
	}

	clientConfig = &ssh.ClientConfig{
		User:            user,
		Auth:            auth,
		Timeout:         10 * time.Second,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
	clientConfig.SetDefaults()

	// connet to ssh
	addr = fmt.Sprintf("%s:%d", host, port)

	if client, err = ssh.Dial("tcp", addr, clientConfig); err != nil {
		return nil, err
	}
	return client, nil
}

func getPublicKey(publicKeyFileName string) ssh.AuthMethod {
	publicBytes, err := ioutil.ReadFile(publicKeyFileName)
	if err != nil {
		log.Fatal("Failed to load public key: ", err)
	}

	publicKey, err := ssh.ParsePrivateKey(publicBytes)
	if err != nil {
		log.Fatal("Failed to parse public key: ", err)
	}
	//
	return ssh.PublicKeys(publicKey)
}

func FileExist(path string) bool {
	_, err := os.Lstat(path)
	return !os.IsNotExist(err)
}
