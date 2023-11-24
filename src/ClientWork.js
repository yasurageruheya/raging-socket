const path = require("path");
const WorkerManager = require("kdjn-worker-manager");
const _root = path.join(__dirname, "../");


class ClientWork
{
	static executeAssignedTask(report)
	{
		return new Promise((resolve, reject)=>
		{
			const sourcecodeHash = report.sourcecodeHash;
			const workerData = report.workerData;
			workerData.jsPath = path.join(_root, "sourcecodeFromHash", sourcecodeHash);
			try
			{
				WorkerManager.assign(workerData).then((workerMain)=>
				{
					resolve(workerMain);
				});
			}
			catch (error)
			{
				reject(error);
			}
		});
	}
}

module.exports = ClientWork;