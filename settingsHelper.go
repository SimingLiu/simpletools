package main

import (
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)


type Settings struct {
	SettingPath string
}

func NewSettings() Settings {
	var settings Settings
	_, fullFilename, _, _ := runtime.Caller(0)
    // 获取带扩展名的文件名
    filenameWithSuffix := filepath.Base(fullFilename)

    // 仅仅获取当前文件夹
    dir := strings.TrimSuffix(fullFilename, filenameWithSuffix)
    settings.SettingPath = dir
	return settings
}

func (s *Settings) SetSettingPath(pathStr string) bool {
	if err := os.MkdirAll(pathStr, 0777); err != nil{
		log.Println(err.Error())
		return false
	}
	s.SettingPath = pathStr
	return true
}

func (s *Settings) ResetSettingPath() bool {
	_, fullFilename, _, _ := runtime.Caller(0)
    filenameWithSuffix := filepath.Base(fullFilename)
    pathStr := strings.TrimSuffix(fullFilename, filenameWithSuffix)
	s.SettingPath = pathStr
	return true
}
