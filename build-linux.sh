#!/bin/sh

APP=influxdbViewer
APPDIR=~/${APP}_0.1.0

mkdir -p $APPDIR/usr/bin
mkdir -p $APPDIR/usr/share/applications
mkdir -p $APPDIR/usr/share/icons/hicolor/1024x1024/apps
mkdir -p $APPDIR/usr/share/icons/hicolor/256x256/apps
mkdir -p $APPDIR/DEBIAN

go build -o $APPDIR/usr/bin/$APP /home/lsm/go/src/github.com/SimingLiu/simpletools/influxdbViewer.go \
/home/lsm/go/src/github.com/SimingLiu/simpletools/influxDBHelper.go /home/lsm/go/src/github\
.com/SimingLiu/simpletools/main.go /home/lsm/go/src/github\
.com/SimingLiu/simpletools/settingsHelper.go /home/lsm/go/src/github\
.com/SimingLiu/simpletools/sqlite3Helper.go

cp icons/icon.jpg $APPDIR/usr/share/icons/hicolor/1024x1024/apps/${APP}.jpg
cp icons/icon.jpg $APPDIR/usr/share/icons/hicolor/256x256/apps/${APP}.jpg

cat > $APPDIR/usr/share/applications/${APP}.desktop << EOF
[Desktop Entry]
Version=0.1.0
Type=Application
Name=$APP
Exec=$APP
Icon=$APP
Terminal=false
StartupWMClass=Lorca
EOF

cat > $APPDIR/DEBIAN/control << EOF
Package: ${APP}
Version: 0.1-0
Section: base
Priority: optional
Architecture: amd64
Maintainer:
Description: 可能不会有更新了

EOF

dpkg-deb --build $APPDIR
