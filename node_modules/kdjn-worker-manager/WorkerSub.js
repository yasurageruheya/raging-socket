const {parentPort, workerData} = require("worker_threads");
const isTransferable = require("./isTransferable");
const _WorkerBase = require("./_WorkerBase");
const Messenger = require("./Messenger");

/**
 * @typedef {"close"|"message"|"messageerror"|"mainWorkerReceived"} WorkerSub#EventName
 */
class WorkerSub extends _WorkerBase
{
	/**
	 * @param {WorkerSub#EventName} eventName
	 * @param {function(...args:any):void} listener
	 * @return {WorkerSub}
	 */
	on(eventName, listener)
	{
		return super.on(eventName, listener);
	}

	/**
	 * @param {WorkerSub#EventName} eventName
	 * @param {function(...args:any):void} listener
	 * @return {WorkerSub}
	 */
	once(eventName, listener) {
		return super.once(eventName, listener);
	}

	/**
	 * @param {WorkerSub#EventName} eventName
	 * @param {function(...args:any):void} [listener]
	 * @return {WorkerSub}
	 */
	off(eventName, listener)
	{
		return super.off(eventName, listener);
	}

	/**
	 * @param {WorkerSub#EventName} eventName
	 * @param {any} args
	 * @return {boolean}
	 */
	emit(eventName, ...args) {
		return super.emit(eventName, args);
	}

	/**
	 *
	 * @param {*} workerData
	 */
	constructor(workerData)
	{
		super();
		/** @type {MessagePort} */
		this.port = parentPort;
		/** @type {Object.<function>} */
		this.modules = {};
		/** @type {Messenger} */
		this.sendToMainWorker = new Messenger(this);
		/** @type {Object.<TransferableObject>} */
		this.transfers = {};
		/** @type {{}} */
		this.vars = {};
		/** @type {string} */
		this.subName = Math.random().toString(36).slice(2);
		/** @type {string} */
		this.name = "";
		/** @type {Object} */
		this.workerData = null;
		/** @type {string} */
		this.currentModule = "";

		objectMessage({workerData: workerData}, this);

		parentPort.on("message", /**
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
							this.transfers[this._tempTransferDataName] = message;
							this._tempTransferDataName = "";
						}
						else objectMessage(message, this);
						break;
				}
				if(message !== "received") parentPort.postMessage("received");
				this.emit("message", message);
			});
	}

	/**
	 *
	 * @param {any} [data=null]
	 * @param {boolean} [transferable=true]
	 */
	processFinish(data=null, transferable=true)
	{
		if(data !== null)
		{
			if(transferable && isTransferable(data))
			{
				this.sendToMainWorker.string("end:afterSendValue");
				this.sendToMainWorker.transfer(data);
			}
			else
			{
				this.sendToMainWorker.vars({end: data});
			}
		}
		else
		{
			this.sendToMainWorker.string("end");
		}
	}
}

/**
 *
 * @param {string} message
 * @param {WorkerSub} subWorker
 */
const stringMessage = (message, subWorker)=>
{
	if(message === "received")
	{
		subWorker.isSending = false;
		subWorker.emit("mainWorkerReceived");
		if(subWorker.messageQueue.length)
		{
			const next = subWorker.messageQueue.shift();
			subWorker.sendToMainWorker._schedule(next.data, next.transferable, next.callback);
		}
	}
	else if(message.indexOf("start") === 0)
	{
		if(typeof subWorker.modules[subWorker.currentModule] !== "function")
			subWorker.modules[subWorker.currentModule] = require(subWorker.currentModule);

		subWorker.modules[subWorker.currentModule](subWorker);
	}
	else if(message.indexOf("transferDataName:") === 0)
	{
		const transferDataName = message.split(":")[1];
		subWorker.transfers[transferDataName] = null;
		subWorker._tempTransferDataName = transferDataName;
	}
}
/**
 *
 * @param {object} message
 * @param {WorkerSub} subWorker
 */
const objectMessage = (message, subWorker)=>
{
	if(message.hasOwnProperty("workerData"))
	{
		subWorker.workerData = message.workerData;
		if(typeof message.workerData === "object") objectMessage(message.workerData, subWorker);
	}
	else
	{
		if(typeof message.jsPath === "string")
		{
			if(typeof subWorker.modules[message.jsPath] === "undefined")
				subWorker.modules[message.jsPath] = null;

			subWorker.currentModule = message.jsPath;
			delete message.jsPath;
		}

		if(typeof message.mainWorkerName === "string")
		{
			subWorker.name = message.mainWorkerName + "_" + subWorker.subName;
			delete message.mainWorkerName;
		}

		for(const key in message)
		{
			subWorker.vars[key] = message[key];
		}
	}
}

new WorkerSub(workerData);