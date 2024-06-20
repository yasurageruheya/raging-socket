const WorkerManager = require("kdjn-worker-manager");

class RagingSocketLogOptions {
	constructor() {
		this.connectionInfo = false;
	}

	/** @return {boolean} */
	get workerLog() { return WorkerManager.logOutput; }

	set workerLog(bool) { WorkerManager.logOutput = bool; }

	getLogOutputStatus() {
		return {
			connectionInfo: this.connectionInfo,
			workerLog: this.workerLog
		}
	}
}

let internalRootPath = process.cwd();

class RagingSocketOptions
{
	static socketPort = 30001;
	static requestTimeout = 30000;
	static autoRequestTryAgain = false;
	static maxAutoRequestTryAgain = 10;
	static autoTimeoutTryAgain = false;
	static maxAutoTimeoutTryAgain = 10;

	static logOptions = new RagingSocketLogOptions();

	static toServerSocketOptions = {};

	static projectScopeRootPath = process.cwd();

	static name = "";
}


RagingSocketOptions.toServerSocketOptions.reconnection = false;


module.exports = RagingSocketOptions;