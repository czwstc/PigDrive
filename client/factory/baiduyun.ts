import * as api from "../api"
import { session, BrowserWindow } from "electron"
import { EventEmitter } from "events";
import request = require("request");
import pathLib from "path"
import PCS from "baidupanapi"
import { existsSync } from "fs";

export class BaiduYunFactory implements api.PigDriveFactory {
    name = "BaiduYun";

    imageUrl = "./img//baiduyun.jpg";

    displayName = "百度云盘";

    createNewPigDrive(args: api.CreateNewPigDriveArgs): Promise<api.PigDrive> {
        return this.loadFromConfig(new Date().getTime())
    }
    loadFromConfig(id: number): Promise<api.PigDrive> {
        return new Promise<api.PigDrive>((resolve, reject) => {
            let drive = new BaiduYunDrive("百度云", this)//TODO
            drive.id = id
            let pcs = new PCS(() => drive.getJar())
            pcs.init.then(() => {
                drive.pcs = pcs
                resolve(drive)
            }).catch(reject)
        })
    }


}

export class BaiduYunDrive extends api.PigDrive {
    id = new Date().getTime()
    name: string;
    factory: api.PigDriveFactory;
    pcs?: PCS;
    get detail() {
        return this.id + ""
    }

    constructor(name: string, factory: api.PigDriveFactory) {
        super()
        this.name = name;
        this.factory = factory
    }

    saveConfig(): void {
        // throw new Error("Method not implemented.");
    }

    getJar() {
        return new Promise<request.CookieJar>((resolve, reject) => {
            let esession = session.fromPartition(`persist:${this.id}`)
            let loginWindow = new BrowserWindow({
                width: 800,
                height: 600,
                webPreferences: {
                    session: esession
                },
                show: false
            })
            loginWindow.loadURL("https://pan.baidu.com")
            let eventEmmiter = new EventEmitter()
            eventEmmiter.once('resolve', (value) => resolve(value))
            eventEmmiter.once('reject', (e) => reject(e))
            eventEmmiter.once('resolve', () => eventEmmiter.emit('return'))
            eventEmmiter.once('reject', () => eventEmmiter.emit('return'))
            loginWindow.on('close', () => eventEmmiter.emit('reject', null))
            let iid = setInterval(() => {
                let title = loginWindow.getTitle()
                if (title.includes("全部文件")) {
                    let jar = api.utils.wrapJar(esession.cookies)
                    resolve(jar)
                    loginWindow.close()
                } else if (title == "pigdrive") {
                } else {
                    loginWindow.maximize()
                }
            }, 1000)
            eventEmmiter.once('return', () => { clearInterval(iid) })
        })
    }

    async delete() {
    }
}