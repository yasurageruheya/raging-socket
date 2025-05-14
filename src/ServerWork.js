/** @type {typeof RequestTask} */
let RequestTask;

/** @type {typeof ToClientSocket} */
let ToClientSocket;

const SocketMessage = require("./SocketMessage");

/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {PackageManager} */
let packageManager;

let isAssigning = false;

class ServerWork
{
	static initialize()
	{
		ToClientSocket = require("./ToClientSocket")
		RequestTask = require("./RequestTask");
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.packageManager;
	}

	/**
	 *
	 * @param {object} workerData
	 * @param {string} processType
	 * @param {string} taskName
	 * @return {Promise<{status:TaskStatus, error:Error, result:any, vars:any}|any>}
	 * @return {Promise<ToClientResponse>}
	 */
	static assign(workerData, processType, taskName)
	{
		return new Promise((resolve, reject) =>
		{
			RequestTask.queue(workerData, resolve, reject, processType, taskName).then(()=>
			{
				if(!isAssigning)
				{
					ToClientSocket.claimStatus();
					isAssigning = true;
					queueMicrotask(assign);
				}
			});
		});
	}

	/**
	 *
	 * @param {RequestTask[]} [requestTasks=[]]
	 */
	static reassign(requestTasks=[])
	{
		const length = requestTasks.length;
		for(let i=0; i<length; i++)
		{
			RequestTask.insertIntoQueue(requestTasks[i]);
		}

		assign();
	}
}

const assign = ()=>
{
	const cpuWorkableClients = ToClientSocket.cpuWorkableClients;
	// console.log("cpuWorkableClients:", Object.keys(cpuWorkableClients).length);
	const gpuWorkableClients = ToClientSocket.gpuWorkableClients;
	const cpuTaskQueues = RequestTask.cpuTaskQueues;
	const gpuTaskQueues = RequestTask.gpuTaskQueues;
	const bothTaskQueues = RequestTask.bothTaskQueues;
	/** @type {Object.<ToClientSocket>} */
	const taskDelegatedClients = {};
	// console.log("=================");
	// console.log("cpuTaskQueues : ", Object.keys(cpuTaskQueues).length, ", gpuTaskQueues", Object.keys(gpuTaskQueues).length);

	const logOptions = RagingSocket.options.logOptions;

	quota(gpuWorkableClients, gpuTaskQueues, "gpu", taskDelegatedClients);
	quota(gpuWorkableClients, bothTaskQueues, "gpu", taskDelegatedClients);
	quota(cpuWorkableClients, cpuTaskQueues, "cpu", taskDelegatedClients);
	quota(cpuWorkableClients, bothTaskQueues, "cpu", taskDelegatedClients);

	//todo: タスクが失敗した後に、そのタスクが完了しても未完了タスクから削除されない！！！！

	for(const address in taskDelegatedClients)
	{
		const toClient = taskDelegatedClients[address];
		const requests = toClient.reserveRequests;
		const length = requests.length;
		const reserve = [];
		// console.log("requests.length:", requests.length);
		for(let i=0; i<length; i++)
		{
			const request = requests[i];
			const promise = request.promise;
			if(promise.requiredPackages)
			{
				toClient.promises.push(promise.requiredPackages.then(requirePackages=>
				{
					request.promise.requiredPackages = null;
					request.requiredPackages = requirePackages;
				}));
			}
			if(logOptions.taskTraceLevel > 1)
				reserve.push(RequestTask.getTaskNameFromTaskId(request.taskId));
		}
		toClient.reserveRequests = [];

		if(logOptions.taskTraceLevel > 2)
			console.log("タスク要求準備:", toClient.ipAddress, reserve.join(" | "));

		Promise.all(toClient.promises).then(()=>
		{
			const outbounds = [];
			const requestTo = [];
			for(let i=0; i<length; i++)
			{
				const request = requests[i];
				outbounds.push(request.reserve());

				if(logOptions.taskTraceLevel > 1)
					requestTo.push(RequestTask.getTaskNameFromTaskId(request.taskId));
			}
			toClient.emit(SocketMessage.S2C_REQUEST_TASKS, outbounds);

			if(logOptions.taskTraceLevel > 1)
				console.log("タスク要求:", toClient.ipAddress, requestTo.join(" | "));
		});
	}

	// console.log("cpuTaskQueues : ", Object.keys(cpuTaskQueues).length, ", gpuTaskQueues", Object.keys(gpuTaskQueues).length);
	if(Object.keys(cpuTaskQueues).length || Object.keys(gpuTaskQueues).length || Object.keys(bothTaskQueues).length)
	{
		ToClientSocket.claimStatus();
	}
	else if(RequestTask.hasIncompleteTasks)
	{
		ToClientSocket.claimStatus();
	}

	isAssigning = false;
}

/**
 *
 * @param {Object.<ToClientSocket>} workableClients
 * @param {Object.<RequestTask[]>} taskQueues
 * @param {"cpu"|"gpu"} processType
 * @param {Object.<ToClientSocket>} taskDelegatedClients
 */
const quota = (workableClients, taskQueues, processType, taskDelegatedClients)=>
{
	const idleProcessingUnitName = "idle"+processType.charAt(0).toUpperCase()+"puLength";

	if(Object.keys(workableClients).length)
	{
		for(const sourcecodeHash in taskQueues)
		{
			const tasks = taskQueues[sourcecodeHash];
			const preferredClients = ToClientSocket.findClientsFromSourcecodeHash(sourcecodeHash, workableClients);

			for(const address in preferredClients)
			{
				const toClientSocket = preferredClients[address];
				const clientStatus = toClientSocket.status;
				const idleProcessingUnitLength = clientStatus[idleProcessingUnitName];
				const length = tasks.length < idleProcessingUnitLength ? tasks.length : idleProcessingUnitLength;
				for(let i=0; i<length; i++)
				{
					const task = tasks.shift();
					taskPackageHashSet(task, toClientSocket);
					clientStatus.delegateTask(task, processType);
				}
				taskDelegatedClients[address] = toClientSocket;
				if(clientStatus[idleProcessingUnitName] <= 0) delete workableClients[sourcecodeHash];
				if(!tasks.length)
				{
					delete taskQueues[sourcecodeHash];
					break;
				}
			}

			if(Object.keys(workableClients).length <= 0) break;
		}

		if(Object.keys(workableClients).length)
		{
			for(const sourcecodeHash in taskQueues)
			{
				const tasks = taskQueues[sourcecodeHash];

				for(const address in workableClients)
				{
					const toClientSocket = workableClients[address];
					const clientStatus = toClientSocket.status;
					const idleProcessingUnitLength = clientStatus[idleProcessingUnitName];
					const length = tasks.length < idleProcessingUnitLength ? tasks.length : idleProcessingUnitLength;
					for(let i=0; i<length; i++)
					{
						const task = tasks.shift();
						taskPackageHashSet(task, toClientSocket);
						clientStatus.delegateTask(task, processType);
					}
					taskDelegatedClients[address] = toClientSocket;
					if(clientStatus[idleProcessingUnitName] <= 0) delete workableClients[address];
					if(!tasks.length)
					{
						delete taskQueues[sourcecodeHash];
						break;
					}
				}

				if(Object.keys(workableClients).length <= 0) break;
			}
		}
	}
}

/**
 *
 * @param {RequestTask} task
 * @param {ToClientSocket} toClientSocket
 */
const taskPackageHashSet = (task, toClientSocket)=>
{
	const sourcecodeHash = task.sourcecodeHash
	task.packageHash = packageManager.getPackageHashFromSourcecodeHash(sourcecodeHash);
	if(!task.packageHash)
	{
		toClientSocket.promises.push(packageManager.getSourcecodeFromSourcecodeHash(sourcecodeHash)
			.then((sourcecode)=>
			{
				return packageManager.getPackageHashFromSourcecode(sourcecode);
			}).then(packageHash =>
			{
				task.packageHash = packageHash;
			})
		);
	}
}


module.exports = ServerWork;