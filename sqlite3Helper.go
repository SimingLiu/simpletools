package main

import (
	"encoding/json"
	"github.com/jinzhu/gorm"
	_ "github.com/jinzhu/gorm/dialects/sqlite"
	"log"
	"path/filepath"
	"time"
)

type InfluxSqlite3 struct {
	db   *gorm.DB
	Root string
}

type InfluxQueryHistory struct {
	Time           *time.Time `gorm:"Column:time;default:(datetime(CURRENT_TIMESTAMP,'localtime'))"`
	ConnectionName *string    `gorm:"column:connection_name;index:db"`
	DbName         *string    `gorm:"column:db_name;index:db"`
	Query          string     `gorm:"column:query;index:query"`
	Param          *string
	Mark           *string
}

func NewSqlite3() InfluxSqlite3 {
	db := InfluxSqlite3{}
	db.GetSettingFromInit()
	return db
}

func (lite *InfluxSqlite3) Close() error {
	return lite.db.Close()
}

func (lite *InfluxSqlite3) GetSettingFromInit() bool {
	settings := NewSettings()
	initDBName := "ifdb.init"
	dbFile := filepath.Join(settings.SettingPath, initDBName)
	var db *gorm.DB
	if db = openDB(dbFile); db == nil {
		return false
	}
	lite.Root = settings.SettingPath
	db.LogMode(true)
	lite.db = db
	newSetting := Settings{}
	hasSettings := db.HasTable(&newSetting)
	if !hasSettings {
		db.CreateTable(&newSetting)
	}
	db.First(&newSetting)
	if newSetting.SettingPath == "" { // init the first record
		newSetting = NewSettings()
		db.Create(&newSetting)
	} else {
		dbFile = filepath.Join(newSetting.SettingPath, initDBName)
		if FileExist(dbFile) {
			if db = openDB(dbFile); db != nil {
				_ = lite.db.Close()
				lite.db = db
			}
			log.Println("db path is " + dbFile)
		} else {
			log.Println(dbFile + " is invalid, use default root path")
		}
	}
	lite.Root = newSetting.SettingPath
	return true
}

func openDB(dbFile string) *gorm.DB {
	db, err := gorm.Open("sqlite3", dbFile)
	if err != nil {
		log.Println(err.Error())
		return nil
	}
	db.LogMode(true)
	return db
}

func (lite *InfluxSqlite3) SaveConnectionInfo(info ConnectionInfo) int64 {
	if !lite.db.HasTable(&info) {
		lite.db.CreateTable(&info)
	}
	if info.RowId > 0 {
		lite.db.Model(&info).Omit("row_id").Updates(info)
	} else {
		lite.db.Create(&info)
	}
	return info.RowId
}

func (lite *InfluxSqlite3) LoadConnections() (result string) {
	var info ConnectionInfo
	if !lite.db.HasTable(&info) {
		lite.db.CreateTable(&info)
	}
	var infos []ConnectionInfo
	lite.db.Find(&infos)
	if len(infos) > 0 {
		if connections, err := json.Marshal(infos); err != nil {
			log.Println(err.Error())
			return
		} else {
			result = string(connections)
		}
	}
	return
}

func (lite *InfluxSqlite3) RemoveConnection(info ConnectionInfo) {
	if !lite.db.HasTable(&info) {
		lite.db.CreateTable(&info)
		return
	}
	if info.RowId < 1 {
		log.Println("RowId is empty, do not delete it")
		return
	}
	lite.db.Delete(&info)
}

func (lite *InfluxSqlite3) ShowHistory(condition *map[string]interface{}) (historys []InfluxQueryHistory) {
	history := InfluxQueryHistory{}
	if !lite.db.HasTable(&history) {
		lite.db.CreateTable(&history)
		return historys
	}
	sql_db := lite.db
	limit := 2000
	if condition != nil {
		if v, ok := (*condition)["ConnectionName"]; ok {
			cv := v.(string)
			history.ConnectionName = &cv
		}
		if v, ok := (*condition)["DbName"]; ok {
			cv := v.(string)
			history.DbName = &cv
		}
		if v, ok := (*condition)["Query"]; ok {
			history.Query = v.(string)
		}

		if v, ok := (*condition)["offset"]; ok {
			sql_db = sql_db.Offset(v.(int))
		}
		if v, ok := (*condition)["limit"]; ok {
			limit = v.(int)
		}
	}
	sql_db = sql_db.Limit(limit)

	sql_db.Order("time desc").Where(&history).Find(&historys)
	return historys
}

