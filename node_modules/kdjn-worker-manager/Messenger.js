class Messenger
{
	/**
	 *
	 * @param {_WorkerBase} workerBase
	 */
	constructor(workerBase)
	{
		/** @type {_WorkerBase} */
		this.workerBase = workerBase;

		this.count = 0;
	}

	/**
	 *
	 * @param {TransferableObject} data
	 * @param {string} [dataName=""]
	 * @param {boolean} [transferable=true]
	 * @param {WorkerMessageCallback} [callback=null]
	 */
	transfer(data, dataName="", transferable=true, callback=null)
	{
		if(!dataName) dataName = Math.random().toString(36).substring(2);
		else if(dataName.includes(":")) throw new Error("ワーカー間で転送するデータ名（dataName）に':'の文字は使えませんよ");
		this._schedule("transferDataName:"+dataName, false);
		this._schedule(data, transferable, callback);
	}

	/**
	 *
	 * @param {object} data
	 * @param {WorkerMessageCallback} [callback=null]
	 */
	vars(data, callback=null)
	{
		this._schedule(data, false, callback);
	}

	/**
	 *
	 * @param {string} str
	 * @param {WorkerMessageCallback} [callback=null]
	 */
	string(str, callback=null)
	{
		this._schedule(str, false, callback);
	}

	/**
	 *
	 * @param {any} data
	 * @param {boolean} [transferable=false]
	 * @param {WorkerMessageCallback} [callback=null]
	 */
	_schedule(data, transferable=false, callback=null)
	{
		if(this.workerBase.isSending) this.workerBase.messageQueue.push({data:data, transferable:transferable, callback});
		else this._sendTo(data, transferable, callback);
	}

	/**
	 *
	 * @param {any} data
	 * @param {boolean} [transferable=false]
	 * @param {WorkerMessageCallback} [callback=null]
	 */
	_sendTo(data, transferable=false, callback=null)
	{
		this.workerBase.isSending = true;
		if(callback)
		{
			if(typeof callback.send !== "undefined") callback.send(this.workerBase);

			if(typeof callback === "function" || typeof callback.received !== "undefined")
			{
				this.workerBase.once("subWorkerReceived", ()=>
				{
					if(typeof callback === "function") callback(this.workerBase);
					else callback.received(this.workerBase);
				});
			}
		}
		if(transferable)
		{
			if(typeof data.buffer !== "undefined" && data.buffer instanceof ArrayBuffer) data = data.buffer;
			try {
				this.workerBase.port.postMessage(data, [data]);
			} catch (error) {
				this.workerBase.port.postMessage(data);
			}
		}
		else this.workerBase.port.postMessage(data);

		if(this.workerBase._log)
		{
			const who = this.workerBase.constructor.name;
			const id = this.workerBase.name;
			console.log(who + ":" + id + " >> ", data);
		}
	}
}

/**
 * @typedef {WorkerEventListener|function(workerBase:_WorkerBase)|null} WorkerMessageCallback
 */

/**
 * @typedef WorkerEventListener
 * @property {function(workerBase:_WorkerBase)} send
 * @property {function(workerBase:_WorkerBase)} received
 */

/**
 * @typedef {ArrayBuffer|MessagePort|ImageBitmap} TransferableObject
 */

module.exports = Messenger;