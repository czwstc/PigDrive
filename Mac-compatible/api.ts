import { Url } from "url";
import { BrowserWindow, app, Menu, Tray, nativeImage } from "electron";
import pathLib from "path"
import fs from "fs"
import * as requests from "request"
import tough_cookie from "tough-cookie"
var FileCookieStore = require('tough-cookie-filestore');

export const factories: PigDriveFactory[] = []
export const drives: PigDrive[] = []
export const configPath = pathLib.join(app.getPath("userData"), "configs")
export namespace utils {

    export function getPigDriveConfigDirPath(pigdrive: PigDrive) {
        return pathLib.join(configPath, pigdrive.factory.name, pigdrive.id + "")
    }

    export function mkdirs(path: string) {
        if (!fs.existsSync(path)) {
            mkdirs(pathLib.dirname(path))
            fs.mkdirSync(path)
        }
    }

    export function touch(path: string) {
        if (!fs.existsSync(path)) {
            mkdirs(pathLib.dirname(path))
            fs.closeSync(fs.openSync(path, "w"))
        }
    }

    export function rm(path: string) {
        if (fs.existsSync(path)) {
            if (fs.statSync(path).isDirectory()) {
                for (let file of fs.readdirSync(path))
                    rm(pathLib.join(path, file))
                fs.rmdirSync(path)
            } else {
                fs.unlinkSync(path)
            }
        }
    }

    export function wrapJar(ecookies: Electron.Cookies, store?: tough_cookie.Store): requests.CookieJar {
        let jar = requests.jar(store)
        ecookies.get({}, (error, cookies) => {
            for (let cookie of cookies) {
                let domain = (cookie.domain as string).substr(1)
                jar.setCookie(new tough_cookie.Cookie({
                    key: cookie.name,
                    value: cookie.value,
                    // expires: new Date(parseInt(cookie.expirationDate as number * 1000 + "")),
                    domain: domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    hostOnly: cookie.hostOnly
                }), `http://${domain}${cookie.path}`)
            }
        })
        return jar
    }

    export function createFileCookieStore(path: string) {
        touch(path)
        try {
            return new FileCookieStore(path)
        } catch (error) {
            fs.unlinkSync(path)
            touch(path)
            return new FileCookieStore(path)
        }
    }
}

export function findPigDriveFactoryByName(name: string) {
    for (let factory of factories)
        if (factory.name == name) return factory
    return null
}

export namespace errors {
    export class CreateNewDriveError extends Error { }
}

export interface ConfigPage {
    name: string
    url: string
}

export interface CommonConfig {
    [key: string]: any
    name?: string
    mountPath?: string
    autoMount?: boolean
}

export abstract class PigDrive {
    id = new Date().getTime();
    abstract name: string;
    abstract factory: PigDriveFactory;
    abstract detail: string;
    commonConfig: CommonConfig = {};
    get commonConfigFilePath(): string {
        return pathLib.join(this.getConfigPath(), "common.json")
    }
    abstract saveConfig(): void;
    _saveConfig(): void {
        this.saveConfig()
        utils.mkdirs(pathLib.dirname(this.commonConfigFilePath))
        fs.writeFileSync(this.commonConfigFilePath, JSON.stringify(this.commonConfig), { flag: "w+" })
    }
    abstract async delete(): Promise<void>;
    abstract listConfigPages(): ConfigPage[];
    getConfigPath(): string {
        return utils.getPigDriveConfigDirPath(this)
    }

    showConfigWindow() {
        let configWindow = new BrowserWindow({ width: 800, height: 600 })
        setupWindow(configWindow)
        configWindow.loadFile("config.html")
        configWindow.webContents.executeJavaScript(`var driveID=${this.id}`)
        // configWindow.webContents.openDevTools()
    }

    static async del(drive: PigDrive): Promise<void> {
        await drive.delete()
        utils.rm(drive.getConfigPath())
        let index = drives.findIndex(v => v.id == drive.id)
        drives.splice(index, 1)
        console.log(`刪除${drive.factory.displayName}(${drive.name})成功`)
    }

    static findByID(id: number) {
        for (let drive of drives)
            if (drive.id == id) return drive
        return null
    }

}

export interface CreateNewPigDriveArgs {
    mainWindow: BrowserWindow | null
}

export interface PigDriveFactory {
    name: string
    displayName: string
    imageUrl: Url | string
    createNewPigDrive(args: CreateNewPigDriveArgs): Promise<PigDrive>
    loadFromConfig(id: number): Promise<PigDrive>
}

export let mainWindow: BrowserWindow | null
export let tray: Tray | null

export function createMainWindow() {
    if (mainWindow != null) return;
    mainWindow = new BrowserWindow({ width: 800, height: 600 })
    setupWindow(mainWindow)
    mainWindow.loadFile('index.html')

    // win.webContents.openDevTools()

    mainWindow.on('closed', () => {
        mainWindow = null
    })
    mainWindow.on("close", (event) => {
        if (mainWindow) mainWindow.hide()
        event.preventDefault()
    })
}

const imgs: any = {}

export function getImage(path: string): nativeImage {
    if (path in imgs) return imgs[path]
    let img = nativeImage.createFromPath(path)
    imgs[path] = img
    return img
}

export function setupWindow(win: BrowserWindow) {
    if(process.platform !== 'darwin')
    win.setIcon(getImage(pathLib.join(__dirname, "img/app_circle.ico")))
}

export function exit() {
    if (tray) {
        console.log("destory tray")
        tray.destroy()
        tray = null
    }
    app.exit()
}

export function createTray() {
    if (tray) return;
    tray = new Tray(getImage(pathLib.join(__dirname, "img/tray.ico")))
    const contextMenu = Menu.buildFromTemplate([
        { label: '显示主窗口', click: () => { if (mainWindow) mainWindow.show() } },
        { label: '退出', click: exit }
    ])
    tray.setToolTip('PigDrive')
    tray.setContextMenu(contextMenu)
    tray.on("double-click", () => {
        if (mainWindow) {
            mainWindow.show()
        }
    })
    tray.on('click', () => {
        if (mainWindow)
            mainWindow.hide()
    })
}