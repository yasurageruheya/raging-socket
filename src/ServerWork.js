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
		packageManager = RagingSocket.manager;
	}

	/**
	 *
	 * @param {object} workerData
	 * @param {string} processType
	 * @return {Promise<{status:TaskStatus, error:Error, result:any, vars:any}|any>}
	 * @return {Promise<ToClientResponse>}
	 */
	static assign(workerData, processType)
	{
		return new Promise((resolve, reject) =>
		{
			RequestTask.queue(workerData, resolve, reject, processType);

			if(!isAssigning)
			{
				queueMicrotask(assign);
				isAssigning = true;
			}
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
	const gpuWorkableClients = ToClientSocket.gpuWorkableClients;
	const cpuTaskQueues = RequestTask.cpuTaskQueues;
	const gpuTaskQueues = RequestTask.gpuTaskQueues;
	/** @type {Object.<ToClientSocket>} */
	const taskDelegatedClients = {};

	if(Object.keys(gpuWorkableClients).length)
	{
		for(const sourcecodeHash in gpuTaskQueues)
		{
			const tasks = gpuTaskQueues[sourcecodeHash];

			const preferredClients = ToClientSocket.findClientsFromSourcecodeHash(sourcecodeHash, gpuWorkableClients);

			for(const address in preferredClients)
			{
				const toClientSocket = preferredClients[address];
				const clientStatus = toClientSocket.status;
				const length = tasks.length < clientStatus.idleGpuLength ? tasks.length : clientStatus.idleGpuLength;
				for(let i=0; i<length; i++)
				{
					const task = tasks.shift();
					taskPackageHashSet(task, toClientSocket);
					clientStatus.delegateTask(task);
					taskDelegatedClients[address] = toClientSocket;
				}
				if(clientStatus.idleGpuLength <= 0) delete gpuWorkableClients[address];
				if(!tasks.length) break;
			}

			if(!tasks.length) delete gpuTaskQueues[sourcecodeHash];
			if(Object.keys(gpuWorkableClients).length <= 0) break;
		}

		if(Object.keys(gpuWorkableClients).length)
		{
			for(const sourcecodeHash in gpuTaskQueues)
			{
				const tasks = gpuTaskQueues[sourcecodeHash];

				for(const address in gpuWorkableClients)
				{
					const toClientSocket = gpuWorkableClients[address];
					const clientStatus = toClientSocket.status;
					const length = tasks.length < clientStatus.idleGpuLength ? tasks.length : clientStatus.idleGpuLength;
					for(let i=0; i<length; i++)
					{
						const task = tasks.shift();
						taskPackageHashSet(task, toClientSocket);
						clientStatus.delegateTask(task);
					}
					taskDelegatedClients[address] = toClientSocket;
					if(clientStatus.idleGpuLength <= 0) delete gpuWorkableClients[address];
					if(!tasks.length) break;
				}

				if(!tasks.length) delete gpuTaskQueues[sourcecodeHash];
				if(Object.keys(gpuWorkableClients).length <= 0) break;
			}
		}
	}




	if(Object.keys(cpuWorkableClients).length)
	{
		for(const sourcecodeHash in cpuTaskQueues)
		{
			const tasks = cpuTaskQueues[sourcecodeHash];

			const preferredClients = ToClientSocket.findClientsFromSourcecodeHash(sourcecodeHash, cpuWorkableClients);

			for(const address in preferredClients)
			{
				const toClientSocket = preferredClients[address];
				const clientStatus = toClientSocket.status;
				const length = tasks.length < clientStatus.idleCpuLength ? tasks.length : clientStatus.idleCpuLength;
				for(let i=0; i<length; i++)
				{
					const task = tasks.shift();
					taskPackageHashSet(task, toClientSocket);
					clientStatus.delegateTask(task);
					taskDelegatedClients[address] = toClientSocket;
				}
				if(clientStatus.idleCpuLength <= 0) delete cpuWorkableClients[address];
				if(!tasks.length) break;
			}

			if(!tasks.length) delete cpuTaskQueues[sourcecodeHash];
			if(Object.keys(cpuWorkableClients).length <= 0) break;
		}

		if(Object.keys(cpuWorkableClients).length)
		{
			for(const sourcecodeHash in cpuTaskQueues)
			{
				const tasks = cpuTaskQueues[sourcecodeHash];

				for(const address in cpuWorkableClients)
				{
					const toClientSocket = cpuWorkableClients[address];
					const clientStatus = toClientSocket.status;
					const length = tasks.length < clientStatus.idleCpuLength ? tasks.length : clientStatus.idleCpuLength;
					for(let i=0; i<length; i++)
					{
						const task = tasks.shift();
						taskPackageHashSet(task, toClientSocket);
						clientStatus.delegateTask(task);
					}
					taskDelegatedClients[address] = toClientSocket;
					if(clientStatus.idleCpuLength <= 0) delete cpuWorkableClients[address];
					if(!tasks.length) break;
				}

				if(!tasks.length) delete cpuTaskQueues[sourcecodeHash];
				if(Object.keys(cpuWorkableClients).length <= 0) break;
			}
		}
	}


	for(const address in taskDelegatedClients)
	{
		const toClient = taskDelegatedClients[address];
		const requests = toClient.requests.concat();
		const length = requests.length;
		for(let i=0; i<length; i++)
		{
			const req = requests[i];
			const promise = req.promise;
			if(promise.requiredPackages)
			{
				toClient.promises.push(promise.requiredPackages.then(requirePackages=>
				{
					req.promise.requiredPackages = null;
					req.requiredPackages = requirePackages;
				}));
			}
		}

		Promise.all(toClient.promises).then(()=>
		{
			const outbounds = [];
			for(let i=0; i<length; i++)
			{
				outbounds.push(requests[i].reserve());
			}
			toClient.emit(SocketMessage.S2C_REQUEST_TASKS, outbounds);
		});
		toClient.requests.length = 0;
	}

	if(Object.keys(cpuTaskQueues).length || Object.keys(gpuTaskQueues).length)
	{
		ToClientSocket.claimStatus();
	}

	isAssigning = false;
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