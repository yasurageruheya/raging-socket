const {EventEmitter} = require("events");

class _WorkerBase extends EventEmitter
{
	constructor()
	{
		super();
		/** @type {boolean} */
		this.isSending = false;
		/** @type {Array.<{data:any, transferable:boolean, callback:WorkerMessageCallback}>} */
		this.messageQueue = [];
		/** @type {Worker|MessagePort} */
		this.port = null;
		/** @type {string} @private */
		this._tempTransferDataName = "";

		this.name = "";
	}
}

module.exports = _WorkerBase;