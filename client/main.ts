import { app, BrowserWindow, Menu, ipcMain, dialog } from "electron"
import * as api from "./api"
import { BaiduYunFactory } from "./factory/baiduyun";
import * as pathLib from "path"
import * as fs from "fs"

let win: BrowserWindow | null

ipcMain.on('createNewPigDrive', (_: any, factoryName: string) => {
    let factory = api.findPigDriveFactoryByName(factoryName) as api.PigDriveFactory
    if (factory) {
        factory.createNewPigDrive({
            mainWindow: win
        }).then((pigDrive) => {
            api.drives.push(pigDrive)
            let configDir = pigDrive.getConfigPath()
            api.utils.mkdirs(configDir)
            pigDrive._saveConfig()
            sendDrivesUpdated()
            console.log(`新建${factory.displayName}(${pigDrive.name})成功`)
        }).catch(e => {
            if (e == null) {
                console.log(`新建${factory.displayName}取消`)
                return
            }
            if (e instanceof api.errors.CreateNewDriveError) {
                dialog.showErrorBox(`新建${factory.displayName}失败`, e.message)
            } else {
                dialog.showErrorBox(`新建${factory.displayName}失败`, "发生未知异常")
                console.log(e)
            }
        })
    }
})

ipcMain.on('deleteDrive', (_: any, driveID: number) => {
    let drive = api.PigDrive.findByID(driveID)
    if (drive) {
        api.PigDrive.del(drive).then(sendDrivesUpdated).catch(console.error)
    }
})

ipcMain.on('configDrive', (_: any, driveID: number) => {
    let drive = api.PigDrive.findByID(driveID)
    if (drive) {
        drive.showConfigWindow()
    }
})

ipcMain.on('updateDriveCommonConfig', (_: any, driveID: number, commonConfig: any) => {
    let drive = api.PigDrive.findByID(driveID)
    if (drive) {
        for (let key in commonConfig)
            drive.commonConfig[key] = commonConfig[key]
        drive._saveConfig()
    }
    sendDrivesUpdated()
})

ipcMain.on('exit', () => {
    app.quit()
})

function sendDrivesUpdated() {
    if (win)
        win.webContents.send("DrivesUpdated")
}

function loadPigDriveFactories() {
    api.factories.push(new BaiduYunFactory())
}

function loadPigDrives() {
    fs.readdir(api.configPath, (err, files) => {
        if (err) return console.error(err)
        for (let file of files) {
            let factory = api.findPigDriveFactoryByName(file) as api.PigDriveFactory
            if (factory) {
                fs.readdir(pathLib.join(api.configPath, file), (err, files) => {
                    if (err) return console.error(err)
                    for (let f of files) {
                        factory.loadFromConfig(parseInt(f)).then(drive => {
                            let commonFile = pathLib.join(drive.getConfigPath(), "common.json")
                            if (fs.existsSync(commonFile))
                                drive.commonConfig = JSON.parse(fs.readFileSync(commonFile).toString("utf-8"))
                            api.drives.push(drive)
                            sendDrivesUpdated()
                            console.log(`成功加载${drive.factory.displayName}(${drive.name})`)
                        }).catch(console.error)
                    }
                })
            }
        }
    })
}

function createWindow() {
    win = new BrowserWindow({ width: 800, height: 600 })
    Menu.setApplicationMenu(null)
    win.loadFile('index.html')

    // win.webContents.openDevTools()

    win.on('closed', () => {
        win = null
    })
    loadPigDriveFactories()
    loadPigDrives()
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
})