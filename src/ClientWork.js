const path = require("path");

/** @type {typeof WorkerManager} */
const WorkerManager = require("kdjn-worker-manager");

const _root = path.join(__dirname, "../");


class ClientWork
{
	static assignWorker(report)
	{
		return new Promise((resolve, reject)=>
		{
			const sourcecodeHash = report.sourcecodeHash;
			const workerData = report.workerData || {};
			workerData.jsPath = path.join(_root, "sourcecodeFromHash", sourcecodeHash);
			try
			{
				//todo: WorkerManager.assign() からの worker 用jsの require のパスをなんとかして変更できないか！！！！！！！
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