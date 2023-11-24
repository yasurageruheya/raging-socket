const {Worker} = require("worker_threads");

const MainMessenger = require("./MainMessenger");
const _WorkerBase = require("./_WorkerBase");

const path = require("path");

/**
 * @typedef {"message"|"exit"|"error"|"end"|"vars"|"start"|"subWorkerReceived"} WorkerMain#EventName
 */
/**
 * @typedef {object} WorkerData
 * @property {string} jsPath
 * @property {string} [mainWorkerName]
 * @property {*} [additionalProperty]
 */

class WorkerMain extends _WorkerBase
{
	static events = ["message","exit","error","end","vars","start","subWorkerReceived"];

	/**
	 * @param {WorkerMain#EventName} eventName
	 * @param {function(...args:any):void} listener
	 * @return {WorkerMain}
	 */
	on(eventName, listener) {
		return super.on(eventName, listener);
	}

	/**
	 * @param {WorkerMain#EventName} eventName
	 * @param {function(...args:any):void} listener
	 * @return {WorkerMain}
	 */
	once(eventName, listener) {
		return super.once(eventName, listener)
	}

	/**
	 * @param {WorkerMain#EventName} eventName
	 * @param {function(...args:any):void} listener
	 * @return {WorkerMain}
	 */
	off(eventName, listener){
		return super.off(eventName, listener);
	}
	/**
	 * @param {WorkerMain#EventName} eventName
	 * @param {any} [args]
	 * @return {boolean}
	 */
	emit(eventName, args) {
		return super.emit(eventName, args);
	}

	/**
	 *
	 * @param {WorkerData} workerData
	 */
	constructor(workerData)
	{
		super();

		this.name = Math.random().toString(36).slice(2);
		this.workerData = workerData;
		workerData.mainWorkerName = this.name;
		this.isEnd = false;

		this.modules = {};
		this.modules[workerData.jsPath] = 1;

		this.willEnd = false;

		const worker = new Worker(path.join(__dirname, "./WorkerSub.js"), {workerData: workerData});
		this.worker = this.port = worker;

		worker.on("message", /**
			@param {any|TransferableObject} message*/
		(message)=>
		{
			switch (typeof message)
			{
				case "string":
					stringMessage(message, this);
					break;
				case "object":
					if(this._tempTransferDataName)
					{
						const sendData = {};
						sendData[this._tempTransferDataName] = message;
						this._tempTransferDataName = "";
						this.emit("vars", sendData);
					}
					else objectMessage(message, this);
					break;
			}
			if(message !== "received")
			{
				worker.postMessage("received");
			}
			this.emit("message", message);
		});
		worker.on("exit", ()=>
		{
			this.emit("exit");
			onSubWorkerEnd(this);
		});
		worker.on("error", (error)=>
		{
			this.emit("error", error);
		});
		/** @type {MainMessenger} */
		this.sendToSubWorker = new MainMessenger(this);
	}

	sendWorkerData(workerData, callback)
	{
		this.modules[workerData.jsPath] = 1;
		this.sendToSubWorker.sendWorkerData(workerData, callback);
	}

	/**
	 * @param {WorkerMessageCallback} [callback=null] サブスレッドに start メッセージが届いた時に実行されるコールバック関数
	 */
	start(callback=null)
	{
		this.isEnd = false;
		this.sendToSubWorker.string("start", callback);
	}
}

/**
 *
 * @param {string} message
 * @param {WorkerMain} workerMain
 */
const stringMessage = (message, workerMain)=>
{
	if(message === "received")
	{
		workerMain.isSending = false;
		workerMain.emit("subWorkerReceived");
		if(workerMain.messageQueue.length)
		{
			const next = workerMain.messageQueue.shift();
			workerMain.sendToSubWorker._schedule(next.data, next.transferable, next.callback);
		}
	}
	else if(message === "end:afterSendValue")
	{
		workerMain.willEnd = true;
	}
	else if(message === "end")
	{
		onSubWorkerEnd(workerMain);
		workerMain.emit("end");
	}
	else if(message.indexOf("transferDataName:") === 0)
	{
		this._tempTransferDataName = message.split(":")[1];
	}
}
/**
 *
 * @param {WorkerMain} workerMain
 */
const onSubWorkerEnd = (workerMain)=>
{
	if(!workerMain.isEnd)
	{
		workerMain.isEnd = true;
		/*
		workerMain.worker.terminate().then(error =>
		{
			if(error) console.log("sub worker terminate error", error);
		});
		*/

	}
}

/**
 *
 * @param {object} message
 * @param {WorkerMain} workerMain
 */
const objectMessage = (message, workerMain)=>
{
	if(typeof message.end !== "undefined")
	{
		onSubWorkerEnd(workerMain);
		workerMain.emit("end", message.end);
	}
	else if(workerMain.willEnd)
	{
		workerMain.willEnd = false;
		onSubWorkerEnd(workerMain);
		workerMain.emit("end", message);
	}
	else
	{
		workerMain.emit("vars", message);
	}
}


module.exports = WorkerMain;