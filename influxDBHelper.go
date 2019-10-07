package main

import (
	"encoding/json"
	"fmt"
	"github.com/fatih/structs"
	client "github.com/influxdata/influxdb1-client/v2"
	"github.com/mitchellh/mapstructure"
	"golang.org/x/crypto/ssh"
	"io"
	"log"
	"net"
	"strconv"
)

type ConnectionInfo struct {
	Group         string `json:"group"`
	RowId         int64  `json:"rowid" gorm:"Column:rowid;AUTO_INCREMENT;primary_key"`
	Name          string `json:"name" gorm:"UNIQUE_INDEX"`
	Host          string `json:"host" gorm:"INDEX:hr"`
	Port          int    `json:"port"`
	UserName      string `json:"username"`
	Password      string `json:"password"`
	UseSSH        string `json:"usessh"`
	LoginType     string `json:"logintype" gorm:"Column:logintype"`
	RemoteHost    string `json:"remotehost" gorm:"INDEX:hr"`
	RemotePort    int    `json:"remoteport"`
	SSHUserName   string `json:"sshusername"`
	SSHPassword   string `json:"sshpassword"`
	SSHPrivateKey string `json:"sshprivatekey"`
}

//func (ConnectionInfo) TableName() string {
//  return "profiles"
//}

type influxDB struct {
	Connected      bool
	Client         client.Client
	ConnectionId   string
	ConnectionName string
}

var SSHClient *ssh.Client
var localListener net.Listener
var redirectHost = "localhost:10358"
var ConnectionPool = make(map[string]client.Client)
var ConnectInfoPool = make(map[string]ConnectionInfo)
var lite3Client = NewSqlite3()
//var r, _ = regexp.Compile(`"(ccid|id)":"(\w*)"`)

func getConnectionId(source map[string]interface{}) string {
	value := "temp"
	if id, ok := source["id"]; ok {
		value = id.(string);
	} else if id, ok := source["ccid"]; ok {
		value = id.(string);
	}
	return value
}

func forward(localConn net.Conn, sshConn net.Conn) {
	// Copy localConn.Reader to sshConn.Writer
	go func() {
		_, err := io.Copy(sshConn, localConn)
		if err != nil {
			log.Fatalf("io.Copy failed: %v", err)
		}
	}()

	// Copy sshConn.Reader to localConn.Writer
	go func() {
		_, err := io.Copy(localConn, sshConn)
		if err != nil {
			log.Fatalf("io.Copy failed: %v", err)
		}
	}()
}

func localTrans(sshConn net.Conn) {
	for {
		// Setup localConn (type net.Conn)
		localConn, err := localListener.Accept()
		if err != nil {
			log.Fatalf("listen.Accept failed: %v", err)
		}
		go forward(localConn, sshConn)
	}
}

func (i *influxDB) Connect(connectInfo map[string]interface{}) bool {
	var connect ConnectionInfo
	connectionId := getConnectionId(connectInfo)
	if connection, ok := ConnectionPool[connectionId]; ok {
		i.Client = connection
		return true
	}
	err := mapstructure.Decode(connectInfo, &connect)
	if err != nil {
		log.Println(err)
		return false
	}
	ConnectInfoPool[connectionId] = connect

	useSSH := connect.UseSSH == "on"
	if useSSH {
		if SSHClient == nil {
			SSHClient, err = SSHConnect(connect.SSHUserName, connect.SSHPassword, connect.SSHPrivateKey,
				connect.RemoteHost, connect.RemotePort)
			if err != nil {
				log.Println("could not connect remote server", err.Error())
				return false
			}
		}
		// Setup sshConn (type net.Conn)
		sshConn, err := SSHClient.Dial("tcp", connect.Host+":"+strconv.Itoa(connect.Port))
		if err != nil {
			log.Println("could not connect to remote influxDB", err.Error())
			return false
		}
		if localListener == nil {
			localListener, err = net.Listen("tcp", redirectHost)
			if err != nil {
				log.Fatalf("net.Listen failed: %v", err)
			}
		}

		go localTrans(sshConn)
	}

	influxHost := redirectHost
	if !useSSH {
		influxHost = connect.Host + ":" + strconv.Itoa(connect.Port)
	}
	c, err := client.NewHTTPClient(client.HTTPConfig{
		Addr: "http://" + influxHost,
	})
	if err != nil {
		log.Println("Error creating InfluxDB Client: ", err.Error())
		i.Connected = false
		return false
	}
	i.Connected = true
	i.Client = c
	i.ConnectionId = connectionId
	i.ConnectionName = connect.Name
	ConnectionPool[connectionId] = c
	return true
}

func (i *influxDB) reconnect(connectId string) bool {
	if connectInfo, ok := ConnectInfoPool[connectId]; ok {
		newConnectionInfo := structs.Map(connectInfo)
		newConnectionInfo["id"] = connectId
		i.Connect(newConnectionInfo)
		return true
	}
	return false
}

func (i *influxDB) Ping() bool {
	if !i.Connected {
		return false
	}
	spent, result, err := i.Client.Ping(0)
	if err != nil {
		log.Println(err.Error())
		return false
	}
	log.Println("connect influxDB v", result, " cost:", spent)
	return true
}

func SaveConnection(connectInfo string) bool {
	sqlite3 := NewSqlite3()
	var connect ConnectionInfo
	err := json.Unmarshal([]byte(connectInfo), &connect)
	if err != nil {
		log.Println(err)
		return false
	}
	sqlite3.SaveConnectionInfo(connect)
	_ = sqlite3.Close()
	return true
}

func (i *influxDB) Disconnect(connectId string) {
	if connection, ok := ConnectionPool[connectId]; ok {
		if err := connection.Close(); err != nil {
			log.Println(err.Error())
		}
		i.Client = nil
		delete(ConnectionPool, connectId)
	}

	if _, ok := ConnectInfoPool[connectId]; ok {
		delete(ConnectInfoPool, connectId)
	}
}

func (i *influxDB) Close() error {
	return i.Client.Close()
}

func (i *influxDB) ShowDatabases(connectInfo map[string]interface{}) string {
	connectionId := getConnectionId(connectInfo);
	if i.Client == nil || i.ConnectionId != connectionId {
		connected := i.Connect(connectInfo);
		if !connected {
			log.Println(connectionId + " could not connect on server")
			return ""
		}
	}
	q := client.NewQuery("show databases;", "", "")
	history := InfluxQueryHistory{
		ConnectionName: &i.ConnectionName,
		Query:          q.Command,
	}
	if !lite3Client.db.HasTable(&history) {
		lite3Client.db.CreateTable(&history)
	}
	lite3Client.db.Save(&history)
	if response, err := i.Client.Query(q); err == nil && response.Error() == nil {
		resRow := response.Results[0]
		series := resRow.Series[0]
		dataType := series.Name
		values := series.Values
		results := []map[string]string{}
		for _, v := range values {
			fmt.Println(dataType, v[0])
			results = append(results, map[string]string{"type": "db", "name": v[0].(string)})
		}
		r, _ := json.Marshal(results)
		return string(r)
	} else {
		if err != nil {
			log.Println(err.Error())
		} else {
			log.Println(response.Error())
		}
	}
	return ""
}

func (i *influxDB) SureConnection(connectionId string) bool {
	if i.ConnectionId != connectionId {
		if c, ok := ConnectionPool[connectionId]; ok {
			i.ConnectionId = connectionId
			i.Client = c
			info, _ := ConnectInfoPool[connectionId]
			i.ConnectionName = info.Name
			return true
		} else {
			return false
		}
	}
	return true
}

func (i *influxDB) ShowsMeasurements(connectionId string, tableName string) string {
	if !i.SureConnection(connectionId) {
		return ""
	}
	q := client.NewQuery("SHOW MEASUREMENTS;", tableName, "")
	history := InfluxQueryHistory{
		ConnectionName: &i.ConnectionName,
		DbName:         &tableName,
		Query:          q.Command,
	}
	lite3Client.db.Save(&history)
	if response, err := i.Client.Query(q); err == nil && response.Error() == nil {
		resRow := response.Results[0]
		series := resRow.Series[0]
		dataType := series.Name
		values := series.Values
		results := []map[string]string{}
		for _, v := range values {
			fmt.Println(dataType, v[0])
			results = append(results, map[string]string{"type": "table", "name": v[0].(string)})
		}
		r, _ := json.Marshal(results)
		return string(r)
	} else {
		if err != nil {
			log.Println(err.Error())
		} else {
			log.Println(response.Error())
		}
	}
	return ""
}

func (i *influxDB) ExecQuery(connectionId string, query string,
	tableName string) (results []map[string]interface{}) {
	if !i.SureConnection(connectionId) {
		return results
	}
	q := client.NewQuery(query, tableName, "")
	history := InfluxQueryHistory{
		ConnectionName: &i.ConnectionName,
		DbName:         &tableName,
		Query:          q.Command,
	}
	lite3Client.db.Save(&history)
	if response, err := i.Client.Query(q); err == nil && response.Error() == nil {
		resRow := response.Results[0]
		if resRow.Series == nil {
			return results
		}
		series := resRow.Series[0]
		//tableName := series.Name
		headers := series.Columns
		values := series.Values
		for _, v := range values {
			result := map[string]interface{}{}
			for i, k := range headers {
				result[k] = v[i]
			}
			results = append(results, result)
		}
		return results
	} else {
		if err != nil {
			results = append(results,map[string]interface{}{"err":err.Error()})
			log.Println(err.Error())
		} else {
			results = append(results,map[string]interface{}{"err":response.Error()})
			log.Println(response.Error())
		}
	}
	return results
}

func (i *influxDB) ExecCommand(connectionId string, query string) (results []map[string]interface{}) {
	if !i.SureConnection(connectionId) {
		return results
	}
	q := client.NewQuery(query, "", "")
	history := InfluxQueryHistory{
		ConnectionName: &i.ConnectionName,
		Query:          q.Command,
	}
	lite3Client.db.Save(&history)
	if response, err := i.Client.Query(q); err == nil && response.Error() == nil {
		resRow := response.Results[0]
		if resRow.Series == nil {
			return results
		}
		series := resRow.Series[0]
		//tableName := series.Name
		headers := series.Columns
		values := series.Values
		for _, v := range values {
			result := map[string]interface{}{}
			for i, k := range headers {
				result[k] = v[i]
			}
			results = append(results, result)
		}
		return results
	} else {
		if err != nil {
			results = append(results,map[string]interface{}{"err":err.Error()})
			log.Println(err.Error())
		} else {
			results = append(results,map[string]interface{}{"err":response.Err})
			log.Println(response.Error())
		}
	}
	return results
}

//func main()  {
//	idb := influxDB{}
//	idb.Connect(`{"host":"192.168.3.27","port":8086}`)
//	//println(idb.ShowDatabases());
//	println(idb.ShowsMeasurements("hello"));
//}
