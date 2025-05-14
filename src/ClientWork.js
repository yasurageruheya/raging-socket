const path = require("path");

/** @type {typeof WorkerManager} */
let WorkerManager;

const sourcecodeFromHashDir = path.join(process.cwd(), "raging-socket", "_sourcecodeFromHash");


class ClientWork
{
	static initialize()
	{
		WorkerManager = require("./RagingSocket").workerManager;
	}

	/**
	 *
	 * @param {object} report
	 * @return {Promise<WorkerMain|Error>}
	 */
	static assignWorker(report)
	{
		return new Promise((resolve, reject)=>
		{
			const sourcecodeHash = report.sourcecodeHash;
			const workerData = report.workerData || {};
			workerData.jsPath = path.join(sourcecodeFromHashDir, sourcecodeHash);

			WorkerManager.assign(workerData).then((workerMain)=>
			{
				resolve(workerMain);
			}).catch(error=>
			{
				reject(error);
			});
		});
	}
}

module.exports = ClientWork;