const {io} = require("socket.io-client");
const cpuIdleCheck = require("./cpuIdleCheck");
const options = require("./RagingSocketOptions");
const SocketMessage = require("./SocketMessage");
/** @type {Object.<ToServerSocket>} */
const instances = {};
const RagingSocket = require("./RagingSocket");
const WorkerMain = require("kdjn-worker-manager/WorkerMain");
const ClientWork = require("./ClientWork");
const RequestTask = require("./RequestTask");

/** @type {Object.<WorkerMain>} */
const assignedWorker = {};

/** @type {Object.<RequestTask>} */
const receivedRequests = {};

/** @type {PackageManager} */
let packageManager;

class ToServerSocket
{
	static connect(ipAddress)
	{
		if(instances[ipAddress]) instances[ipAddress] = new ToServerSocket(ipAddress);
		return instances[ipAddress];
	}

	/** @type {Object.<Socket>} */
	static sockets = {};

	static initialize()
	{
		packageManager = RagingSocket.manager;
	}

	constructor(ipAddress)
	{
		const socket = io("ws://" + ipAddress + ":" + options.socketPort, options.toServerSocketOptions);
		ToServerSocket.sockets[ipAddress] = socket;

		socket.io.on("reconnect_failed", ()=>
		{
			socket.off();
			socket.io.off();
			delete ToServerSocket.sockets[ipAddress];
		});

		socket.on(SocketMessage.S2C_CLAIM_STATUS, ()=>
		{
			sendMyStatus(socket);
		});

		socket.on(SocketMessage.S2C_REQUEST_TASKS,
			/** @param {RequestTask[]} requests */
			(requests)=>
			{
				const reports = {};
				const length = requests.length;
				const myStatus = RagingSocket.myStatus;

				myStatus.cpuIdles = cpuIdleCheck();

				const promises = [];
				for(let i=0; i<length; i++)
				{
					const request = requests[i];
					const taskId = request.taskId;
					const report = {taskId: taskId};
					reports[taskId] = report;
					if(request.processType === "cpu" && myStatus.idleCpuLength <= 0)
					{
						report.status = SocketMessage.C2S_UNACCEPTABLE_TASK;
						report.reason = SocketMessage.CPU_LIMIT;
						continue;
					}
					else if(request.processType === "gpu" && myStatus.idleGpuLength <= 0)
					{
						report.status = SocketMessage.C2S_UNACCEPTABLE_TASK;
						report.reason = SocketMessage.CPU_LIMIT;
						continue;
					}

					receivedRequests[taskId] = request;
					if(request.processType === "cpu") myStatus.runningCpuProcesses++;
					else myStatus.runningGpuProcesses++;

					const sourcecodeHash = requests[i].sourcecodeHash;

					promises.push(()=>
					{
						return packageManager.getSourcecodeFromSourcecodeHash(sourcecodeHash).then(sourcecode=>
						{
							if(!sourcecode)
							{
								report.status = SocketMessage.C2S_REQUEST_SOURCECODE;
								report.sourcecodeHash = sourcecodeHash;
								report.requiredPackageHash = packageManager.getPackageHashFromPackages(request.requiredPackages);
							}
							else
							{
								const shortfallPackageHash = checkShortfallPackagesFromSourcecode(packageManager, request.requiredPackages);
								if(shortfallPackageHash)
								{
									report.status = SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH;
									report.shortfallPackageHash = shortfallPackageHash;
								}
								else
								{
									report.status = SocketMessage.C2S_CONFIRM_TASKS;
								}
							}
						});
					});
				}

				Promise.all(promises).then(()=>
				{
					socket.emit(SocketMessage.C2S_REPORT_TASKS_STATUS, reports);
				});
			});

		socket.on(SocketMessage.S2C_TASK_SUPPLEMENTATION,
			/** @param {object[]|any} reports */
			(reports)=>
			{
				let i = reports.length;
				while (i--)
				{
					const report = reports[i];
					switch (report.status)
					{
						case SocketMessage.S2C_RESPONSE_SOURCECODE:
							const requiredPackages = packageManager.getPackagesFromPackageHash(report.requiredPackageHash);
							const shortfallPackageHash = checkShortfallPackagesFromSourcecode(packageManager, requiredPackages);
							if(shortfallPackageHash)
							{
								report.status = SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH;
								report.shortfallPackageHash = shortfallPackageHash;
							}
							else
							{
								report.status = SocketMessage.C2S_CONFIRM_TASKS;
							}
							break;
						case SocketMessage.S2C_REQUEST_PACKAGES_FROM_PACKAGE_HASH:
							report.status = SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH;
							report.shortfallPackages = packageManager.getPackagesFromPackageHash(report.shortfallPackageHash);
							break;
						case SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER:
							packageManager.setPackageBuffer(report.shortfallPackageHash, report.buffer);
							report.status = SocketMessage.C2S_CONFIRM_TASKS;
							break;
						case SocketMessage.S2C_SEND_WORKER_DATA:
							const taskId = report.taskId;
							ClientWork.executeAssignedTask(report).then(
								/** @param {WorkerMain} workerMain */ workerMain=>
								{
									/** @type {any} */
									const report = {taskId: taskId};
									workerMain.once("end", result =>
									{
										report.result = result;

										removeRequest(taskId);

										socket.emit(SocketMessage.C2S_TASK_COMPLETE, report);
									});

									workerMain.on("error", error =>
									{
										report.error = error;
										socket.emit(SocketMessage.C2S_TASK_ERROR, report);
									});

									workerMain.on("vars", vars =>
									{
										report.vars = vars;
										socket.emit(SocketMessage.C2S_TASK_PROCESSING, report);
									});

									workerMain.once("start", ()=>
									{
										socket.emit(SocketMessage.C2S_TASK_STARTED, report);
									});

									assignedWorker[taskId] = workerMain;
									socket.emit(SocketMessage.C2S_WORKER_READY, report);

									//todo: サーバーからの transfer とか vars を受け入れる！！！！
								}).catch(error =>
								{
									/** @type {any} */
									const report = {taskId: taskId, error: error};
									socket.emit(SocketMessage.C2S_TASK_ERROR, report);
								});
							reports.splice(i, 1);
							break;
					}
				}

				socket.emit(SocketMessage.C2S_REPORT_TASKS_STATUS, reports);
			});

		socket.on(SocketMessage.S2C_RECEIVE_RESULT, ()=>
		{
			sendMyStatus(socket);
		});

		socket.on(SocketMessage.S2C_TASK_CANCEL, taskId =>
		{
			removeRequest(taskId);
			sendMyStatus(socket);
		});
	}
}

const removeRequest = (taskId)=>
{
	const request = receivedRequests[taskId];
	if(request.processType === "cpu") RagingSocket.myStatus.runningCpuProcesses--;
	else RagingSocket.myStatus.runningGpuProcesses--;
}

const checkShortfallPackagesFromSourcecode = (manager, requiredPackages)=>
{
	const shortfallPackages = manager.compareRequiredPackages(requiredPackages);
	if(Object.keys(shortfallPackages).length)
	{
		return manager.getPackageHashFromPackages(shortfallPackages);
	}
	else return null;
}

const sendMyStatus = (toServerSocket)=>
{
	const myStatus = RagingSocket.myStatus;
	myStatus.cpuIdles = cpuIdleCheck();

	const report = {};
	report.cpuIdles = myStatus.cpuIdles;
	report.packages = myStatus.packages;
	report.sourcecodes = myStatus.sourcecodes;
	report.gpuLength = myStatus.gpuLength;
	report.runningCpuProcesses = myStatus.runningCpuProcesses;
	report.runningGpuProcesses = myStatus.runningGpuProcesses;

	toServerSocket.emit(SocketMessage.C2S_STATUS_REPORT, report);
}

module.exports = ToServerSocket;