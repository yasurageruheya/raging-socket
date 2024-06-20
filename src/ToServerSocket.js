const {io} = require("socket.io-client");
const cpuIdleCheck = require("./cpuIdleCheck");
const options = require("./RagingSocketOptions");
const SocketMessage = require("./SocketMessage");
/** @type {Object.<ToServerSocket>} */
const instances = {};

/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {typeof ClientWork} */
let ClientWork;

/** @type {Object.<WorkerMain>} */
const assignedWorker = {};

/** @type {Object.<RequestTask>} */
const receivedRequests = {};

/** @type {Object.<ArrayBuffer>} */
const willSendBuffers = {};


const SocketEmitter = require("./SocketEmitter");

/** @type {PackageManager} */
let packageManager;

class ToServerSocket extends SocketEmitter
{
	static connect(ipAddress)
	{
		console.log("ipAddress : ", ipAddress);
		if(typeof instances[ipAddress] === "undefined") instances[ipAddress] = new ToServerSocket(ipAddress);
		return instances[ipAddress];
	}

	static initialize()
	{
		ClientWork = require("./ClientWork");
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.manager;
	}

	constructor(ipAddress)
	{
		super(ipAddress);
		const socket = io("ws://" + ipAddress + ":" + options.socketPort, options.toServerSocketOptions);
		this.socket = socket;

		socket.io.on("reconnect_failed", ()=>
		{
			console.log("socket.io reconnect_failed");
			this.off();
			socket.io.off();
			delete instances[ipAddress];
		});

		this.on(SocketMessage.S2C_CLAIM_STATUS, ()=>
		{
			sendMyStatus(this);
		});

		this.on(SocketMessage.S2C_REQUEST_TASKS,
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
						report.reason = SocketMessage.GPU_LIMIT;
						continue;
					}

					receivedRequests[taskId] = request;
					if(request.processType === "cpu") myStatus.runningCpuProcesses++;
					else myStatus.runningGpuProcesses++;

					const sourcecodeHash = requests[i].sourcecodeHash;

					promises.push(packageManager.getSourcecodeFromSourcecodeHash(sourcecodeHash).then(sourcecode=>
					{
						if(!sourcecode)
						{
							report.status = SocketMessage.C2S_REQUEST_SOURCECODE;
							report.sourcecodeHash = sourcecodeHash;
							report.requiredPackageHash = packageManager.getPackageHashFromPackages(request.requiredPackages);
						}
						else
						{
							const shortfallPackageHash = checkShortfallPackageHashFromSourcecode(packageManager, request.requiredPackages);
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
					}));
				}

				Promise.all(promises).then(()=>
				{
					this.emit(SocketMessage.C2S_REPORT_TASKS_STATUS, reports);
				});
			});

		this.on(SocketMessage.S2C_TASK_SUPPLEMENTATION,
			/** @param {object[]|any} reports */
			(reports)=>
			{
				const promises = [];
				for(const taskId in reports)
				{
					const report = Object.assign(receivedRequests[taskId], reports[taskId]);
					switch (report.status)
					{
						case SocketMessage.S2C_RESPONSE_SOURCECODE:
							promises.push(new Promise(resolve =>
							{
								packageManager.getPackagesFromSourcecode(report.sourcecode).then(requiredPackages =>
								{
									const shortfallPackageHash = checkShortfallPackageHashFromSourcecode(packageManager, requiredPackages);
									if(shortfallPackageHash)
									{
										report.status = SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH;
										report.shortfallPackageHash = shortfallPackageHash;
									}
									else
									{
										report.status = SocketMessage.C2S_CONFIRM_TASKS;
									}
									resolve();
								})
							}));

							break;
						case SocketMessage.S2C_REQUEST_PACKAGES_FROM_PACKAGE_HASH:
							report.status = SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH;
							report.shortfallPackages = packageManager.getPackagesFromPackageHash(report.shortfallPackageHash);
							break;
						case SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER:
							const p = packageManager.setPackageBuffer(report.shortfallPackageHash, report.buffer);
							promises.push(p);
							report.status = SocketMessage.C2S_CONFIRM_TASKS;
							break;
						case SocketMessage.S2C_SEND_WORKER_DATA:
							ClientWork.assignWorker(report).then(
								/** @param {WorkerMain} workerMain */
								(workerMain)=>
								{
									assignedWorker[taskId] = workerMain;
									this.emit(SocketMessage.C2S_WORKER_READY, report);

								}).catch(error =>
							{
								/** @type {any} */
								const report = {taskId, error};
								this.emit(SocketMessage.C2S_TASK_PREPROCESS_ERROR, report);
							});
							delete reports[taskId];
							break;
					}
				}

				Promise.all(promises).then(()=>
				{
					if(Object.keys(reports).length)
					{
						this.emit(SocketMessage.C2S_REPORT_TASKS_STATUS, reports);
					}
				});
			});

		this.on(SocketMessage.S2C_RECEIVE_RESULT, ()=>
		{
			sendMyStatus(this);
		});

		this.on(SocketMessage.S2C_TASK_CANCEL, (taskId) =>
		{
			removeRequest(taskId);
			sendMyStatus(this);
		});

		this.on(SocketMessage.S2C_SEND_TRANSFER_DATA, (taskId, data, dataName)=>
		{
			assignedWorker[taskId].sendToSubWorker.transfer(data, dataName, true, ()=>
			{
				this.emit(SocketMessage.C2S_RECEIVED_TRANSFER_DATA, dataName);
			});
		});

		this.on(SocketMessage.S2C_SEND_VARS, (taskId, data)=>
		{
			assignedWorker[taskId].sendToSubWorker.vars(data, ()=>
			{
				this.emit(SocketMessage.C2S_RECEIVED_VARS);
			});
		});

		this.on(SocketMessage.S2C_TASK_START, (taskId)=>
		{
			const workerMain = assignedWorker[taskId];
			/** @type {any} */
			const report = {taskId: taskId};
			workerMain.once("end", result =>
			{
				removeRequest(taskId);
				if(result instanceof ArrayBuffer)
				{
					const sendBufferId = Math.random().toString(36).slice(2);
					report.result = sendBufferId;
					willSendBuffers[sendBufferId] = result;
					this.emit(SocketMessage.C2S_TASK_COMPLETE_AND_AFTER_SEND_BUFFER, report);
				}
				else
				{
					report.result = result;
					this.emit(SocketMessage.C2S_TASK_COMPLETE, report);
				}
			});

			workerMain.on("error", error =>
			{
				report.error = error;
				this.emit(SocketMessage.C2S_TASK_PROCESSING_ERROR, report);
			});

			workerMain.on("vars", vars =>
			{
				report.vars = vars;
				this.emit(SocketMessage.C2S_TASK_PROCESSING, report);
			});

			workerMain.start(()=>
			{
				this.emit(SocketMessage.C2S_TASK_STARTED, taskId);
			});
		});

		this.on(SocketMessage.S2C_CLAIM_RESULT_BUFFER, (bufferId)=>
		{
			const segments = [];
			const sendBuffer = willSendBuffers[bufferId];
			const byteLength = Buffer.byteLength(sendBuffer);
			console.log(bufferId, "byteLength:"+Buffer.byteLength(sendBuffer));
			for(let i=0; i<byteLength; i += 1_000_000)
			{
				segments.push(sendBuffer.slice(i, i + 1_000_000));
			}
			const onClaimBuffer = ()=>
			{
				if(segments.length) this.emit(bufferId, segments.shift());
				else
				{
					this.off(bufferId, onClaimBuffer);
					this.emit(bufferId, "end");
				}
			}
			this.on(bufferId, onClaimBuffer);
			this.emit(bufferId, segments.shift());
		});

		this.on(SocketMessage.S2C_RESULT_BUFFER_RECEIVED, (bufferId)=>
		{
			willSendBuffers[bufferId] = null;
			delete willSendBuffers[bufferId];
		});
	}
}

const removeRequest = (taskId)=>
{
	const request = receivedRequests[taskId];
	if(request.processType === "cpu") RagingSocket.myStatus.runningCpuProcesses--;
	else RagingSocket.myStatus.runningGpuProcesses--;
}

const checkShortfallPackageHashFromSourcecode = (manager, requiredPackages)=>
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