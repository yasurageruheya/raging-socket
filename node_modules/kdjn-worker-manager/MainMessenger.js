const Messenger = require("./Messenger");

class MainMessenger extends Messenger
{
	/**
	 *
	 * @param {_WorkerBase} workerBase
	 */
	constructor(workerBase)
	{
		super(workerBase);
	}

	sendWorkerData(workerData, callback=null)
	{
		this._schedule({workerData: workerData}, false, callback);
	}
}

module.exports = MainMessenger;